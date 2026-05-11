"""Chat API endpoints — delegates to the working client.py system."""
import json
import logging
import asyncio
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address
from typing import Dict, Any

from src.llm.client import chat_multi_stream, get_cfg, CANVAS_TOOLS, execute_agent_tool, L3_TOOL_NAMES
from src.llm.router import (
    _tool_result_lock,
    _tool_result_buffers,
    _tool_result_events,
    _wait_for_tool_result,
)
from src.core.session import SessionStorage
from src.core.session.manager import SessionManager
from src.core.runtime.types import Message, ToolCall

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])
limiter = Limiter(key_func=get_remote_address)


class ChatRequest(BaseModel):
    """Chat request model."""
    session_id: str
    provider_id: str
    input: str
    context: Dict[str, Any]


MAX_ROUNDS = 3


@router.post("/stream")
@limiter.limit("10/minute")
async def chat_stream(request: Request, body: ChatRequest):
    """Streaming chat endpoint — delegates to client.py system."""
    cfg = get_cfg()
    session_id = body.session_id

    # ── Save user message to session ──
    storage = SessionStorage()
    await storage.init_db()
    session_manager = SessionManager(storage)
    await session_manager.add_message(session_id, Message(
        role="user",
        content=body.input,
    ))

    # Build canvas context
    ctx = body.context
    cards = ctx.get("cards", [])
    connections = ctx.get("connections", [])
    groups = ctx.get("groups", [])

    context_parts = []
    if cards:
        card_lines = []
        for c in cards:
            status = f" [{c.get('status', '')}]" if c.get('status') else ""
            question = f" ?\"{c.get('openQuestion', '')}\"" if c.get('openQuestion') else ""
            card_lines.append(f"  #{c['id']}: {c['text']}{status}{question}")
        context_parts.append(f"当前画布上的卡片 ({len(cards)} 张):\n" + "\n".join(card_lines))

    if connections:
        conn_lines = [f"  #{c['from']} --[{c['label']}]--> #{c['to']}" for c in connections]
        context_parts.append(f"卡片之间的连接 ({len(connections)} 条):\n" + "\n".join(conn_lines))

    if groups:
        group_lines = [f"  {g['name']}: 卡片 {g.get('cardIds', g.get('card_ids', []))}" for g in groups]
        context_parts.append(f"卡片分组 ({len(groups)} 个):\n" + "\n".join(group_lines))

    canvas_summary = "\n\n".join(context_parts) if context_parts else "画布当前为空。"

    active_labels = ctx.get("active_labels", [])
    labels_hint = ""
    if active_labels:
        labels_hint = "\n\n可用的关系类型（创建连接时必须从中选择）：\n" + "\n".join(f"  - {l}" for l in active_labels)

    system_prompt = f"""你是 Nexus 外脑思维链路管理系统的 AI 助手。你可以看到用户画布上的所有卡片、连接和分组。

你的职责：
- 帮助用户理解和分析他们的思维结构
- 回答关于画布内容的任何问题
- 提供洞察、质疑、建议和新的思考角度
- 帮助用户发现思维中的盲点和逻辑漏洞
- 用中文回答，技术术语可用英文

重要：当你发现需要创建新卡片、建立连接、或设置开放问题时，直接使用工具操作画布，不要只是建议用户去做。
{labels_hint}

## 响应规则（必须遵守）
- 画布状态已在下方提供，不要调用 analyze_canvas 等分析工具重复分析
- 收到用户消息后，直接基于已有画布状态给出回答或执行操作
- 每次回复最多使用 1-2 个工具调用，然后必须输出文字回复
- 绝对不要在没有输出文字的情况下连续发起多轮工具调用
- 如果用户说"继续讨论"或类似的话，直接基于当前画布内容给出下一步建议

当前画布上下文：
{canvas_summary}"""

    # Build messages array
    messages = [{"role": "user", "content": body.input}]
    main_loop = asyncio.get_event_loop()

    def event_stream():
        all_text = ""
        all_tool_calls = []
        try:
            for _ in range(MAX_ROUNDS):
                tool_uses = []
                current_tool_id = None
                current_tool_name = None
                current_tool_json = ""

                with chat_multi_stream(
                    system=system_prompt,
                    messages=messages,
                    model=cfg.llm.flow.model,
                    max_tokens=cfg.llm.flow.max_tokens,
                    temperature=cfg.llm.flow.temperature,
                    tools=CANVAS_TOOLS,
                ) as stream:
                    for event in stream:
                        if event.type == "content_block_start":
                            if event.content_block.type == "tool_use":
                                current_tool_id = event.content_block.id
                                current_tool_name = event.content_block.name
                                current_tool_json = ""
                                yield f"data: {json.dumps({'type': 'tool_start', 'id': current_tool_id, 'name': current_tool_name})}\n\n"
                        elif event.type == "content_block_delta":
                            if event.delta.type == "text_delta":
                                all_text += event.delta.text
                                yield f"data: {json.dumps({'type': 'text', 'text': event.delta.text})}\n\n"
                            elif event.delta.type == "input_json_delta":
                                current_tool_json += event.delta.partial_json
                                yield f"data: {json.dumps({'type': 'tool_delta', 'json': event.delta.partial_json})}\n\n"
                        elif event.type == "content_block_stop":
                            if current_tool_name and current_tool_json:
                                tool_uses.append({
                                    "id": current_tool_id,
                                    "name": current_tool_name,
                                    "input": current_tool_json,
                                })
                            current_tool_name = None
                            current_tool_json = ""
                            yield f"data: {json.dumps({'type': 'block_stop'})}\n\n"
                        elif event.type == "message_stop":
                            yield f"data: {json.dumps({'type': 'message_stop'})}\n\n"

                if not tool_uses:
                    break

                # Build assistant message with tool_use blocks
                assistant_content = []
                for tu in tool_uses:
                    try:
                        tool_input = json.loads(tu["input"])
                    except json.JSONDecodeError:
                        tool_input = {}
                    assistant_content.append({
                        "type": "tool_use",
                        "id": tu["id"],
                        "name": tu["name"],
                        "input": tool_input,
                    })
                    all_tool_calls.append({"name": tu["name"], "arguments": tool_input})
                messages.append({"role": "assistant", "content": assistant_content})

                # Execute tools — L3 agent tools run server-side, others wait for frontend
                tool_results = []
                for tu in tool_uses:
                    tool_name = tu["name"]
                    try:
                        tool_input = json.loads(tu["input"])
                    except (json.JSONDecodeError, TypeError):
                        tool_input = tu["input"] if isinstance(tu["input"], dict) else {}

                    # L3 agent tools: execute server-side
                    if tool_name in L3_TOOL_NAMES:
                        try:
                            future = asyncio.run_coroutine_threadsafe(
                                execute_agent_tool(tool_name, tool_input, ctx),
                                main_loop,
                            )
                            result_content = future.result(timeout=60)
                        except Exception as agent_err:
                            logger.error(f"Agent tool {tool_name} failed: {agent_err}")
                            result_content = None
                        if result_content is None:
                            result_content = json.dumps({"error": f"Agent tool {tool_name} not available"})
                        # Send agent result as SSE event for frontend to create card
                        yield f"data: {json.dumps({'type': 'agent_result', 'tool': tool_name, 'result': json.loads(result_content)})}\n\n"
                    # Regular tools: wait for frontend execution
                    elif session_id:
                        result_content = _wait_for_tool_result(session_id, tu["id"], timeout=30.0)
                    else:
                        result_content = "Tool executed successfully."

                    tool_results.append({
                        "type": "tool_result",
                        "tool_use_id": tu["id"],
                        "content": result_content,
                    })
                messages.append({"role": "user", "content": tool_results})

        except Exception as e:
            logger.error(f"Streaming chat failed: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': 'Chat service unavailable'})}\n\n"
        finally:
            if session_id:
                with _tool_result_lock:
                    _tool_result_buffers.pop(session_id, None)
                    _tool_result_events.pop(session_id, None)

            # ── Save assistant message to session ──
            if all_text or all_tool_calls:
                tool_calls = [
                    ToolCall(id=f"tc_{i}", name=tc["name"], arguments=tc["arguments"])
                    for i, tc in enumerate(all_tool_calls)
                ] if all_tool_calls else None
                msg = Message(
                    role="assistant",
                    content=all_text or None,
                    tool_calls=tool_calls,
                )
                try:
                    asyncio.run_coroutine_threadsafe(
                        session_manager.add_message(session_id, msg),
                        main_loop,
                    ).result(timeout=5)
                except Exception as e:
                    logger.error(f"Failed to save assistant message: {e}")

    return StreamingResponse(event_stream(), media_type="text/event-stream")
