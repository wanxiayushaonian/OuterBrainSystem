# ═══════════════════════════════════════════════════════
# LLM API Router — /api/llm/* endpoints
# ═══════════════════════════════════════════════════════
import json
import logging

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.llm.client import chat, chat_json, chat_multi, chat_multi_stream, get_cfg, CANVAS_TOOLS
from src.llm.prompts import (
    DEBATE_SYSTEM,
    DEBATE_USER,
    DISCOVER_SYSTEM,
    DISCOVER_USER,
    FLOW_ANALYSIS_SYSTEM,
    FLOW_ANALYSIS_USER,
    INQUIRY_SYSTEM,
    INQUIRY_USER,
    KEYWORD_EXTRACT_SYSTEM,
    KEYWORD_EXTRACT_USER,
    SEARCH_SYSTEM,
    SEARCH_USER,
    TITLE_COMPRESS_SYSTEM,
    TITLE_COMPRESS_USER,
)
from src.llm.schemas import (
    ChatRequest,
    ChatResponse,
    CompressRequest,
    CompressResponse,
    DebateRequest,
    DebateResponse,
    DiscoverRequest,
    DiscoverResponse,
    FlowRequest,
    FlowResponse,
    InquiryRequest,
    InquiryResponse,
    KeywordsRequest,
    KeywordsResponse,
    SearchRequest,
    SearchResponse,
    ToolResultRequest,
)

# ── Tool result relay (frontend → backend) ──
import threading

_tool_result_lock = threading.Lock()
# session_id → {tool_use_id: result_string}
_tool_result_buffers: dict[str, dict[str, str]] = {}
_tool_result_events: dict[str, threading.Event] = {}

logger = logging.getLogger(__name__)
router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _ensure_dict(result: dict | list, fallback: dict) -> dict:
    """Ensure result is a dict; if it's a list, use fallback."""
    if isinstance(result, dict):
        return result
    logger.warning(f"Expected dict from LLM but got {type(result).__name__}, using fallback")
    return fallback


@router.post("/compress", response_model=CompressResponse)
@limiter.limit("30/minute")
def compress_title(request: Request, req: CompressRequest):
    """Compress a thought into a short title."""
    cfg = get_cfg()
    system = TITLE_COMPRESS_SYSTEM.format(max_length=req.max_length)
    user = TITLE_COMPRESS_USER.format(text=req.text)

    try:
        title = chat(
            system=system,
            user=user,
            model=cfg.llm.compress.model,
            max_tokens=cfg.llm.compress.max_tokens,
            temperature=cfg.llm.compress.temperature,
        ).strip().strip('"').strip("'")
    except Exception as e:
        logger.error(f"Title compression failed: {e}")
        raise HTTPException(status_code=502, detail="LLM service unavailable")

    return CompressResponse(
        title=title,
        original_length=len(req.text),
        compressed_length=len(title),
    )


def _fallback_keywords(text: str, max_keywords: int) -> list[str]:
    """Simple local keyword extraction as fallback."""
    import re

    # Common stop words to exclude
    stop_words = {
        "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
        "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
        "自己", "这", "他", "她", "它", "们", "那", "些", "什么", "怎么", "如何", "为什么",
        "可以", "可能", "应该", "需要", "已经", "正在", "将", "把", "被", "给", "对",
        "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
        "have", "has", "had", "do", "does", "did", "will", "would", "could",
        "should", "may", "might", "can", "shall", "to", "of", "in", "for",
        "on", "with", "at", "by", "from", "as", "into", "through", "during",
        "before", "after", "above", "below", "between", "out", "off", "over",
        "under", "again", "further", "then", "once", "and", "but", "or",
        "not", "no", "nor", "so", "if", "when", "where", "how", "all", "each",
        "every", "both", "few", "more", "most", "other", "some", "such",
        "than", "too", "very", "just", "about", "up", "down", "this", "that",
        "these", "those", "it", "its", "i", "me", "my", "we", "our", "you",
        "your", "he", "him", "his", "she", "her", "they", "them", "their",
    }

    # Split by whitespace and punctuation, filter short words and stop words
    words = re.findall(r"[一-鿿]+|[a-zA-Z]{2,}", text)
    filtered = [w for w in words if w.lower() not in stop_words and len(w) > 1]

    # Count frequency and return top N
    from collections import Counter
    counts = Counter(filtered)
    return [word for word, _ in counts.most_common(max_keywords)]


@router.post("/keywords", response_model=KeywordsResponse)
@limiter.limit("30/minute")
def extract_keywords(request: Request, req: KeywordsRequest):
    """Extract keywords from a thought."""
    cfg = get_cfg()
    system = KEYWORD_EXTRACT_SYSTEM.format(max_keywords=req.max_keywords)
    user = KEYWORD_EXTRACT_USER.format(text=req.text)

    try:
        raw = chat(
            system=system,
            user=user,
            model=cfg.llm.keywords.model,
            max_tokens=cfg.llm.keywords.max_tokens,
            temperature=cfg.llm.keywords.temperature,
        ).strip()
        # Parse comma-separated keywords
        keywords = [k.strip().strip('"').strip("'") for k in raw.split(",") if k.strip()]
        keywords = [k for k in keywords if k]
    except Exception as e:
        logger.warning(f"LLM keyword extraction failed, using fallback: {e}")
        keywords = _fallback_keywords(req.text, req.max_keywords)

    return KeywordsResponse(keywords=[str(k) for k in keywords[:req.max_keywords]])


@router.post("/flow", response_model=FlowResponse)
@limiter.limit("10/minute")
def analyze_flow(request: Request, req: FlowRequest):
    """Analyze a thinking chain and suggest next steps."""
    cfg = get_cfg()
    cards_json = json.dumps(req.cards, ensure_ascii=False, indent=2)
    connections_json = json.dumps(req.connections, ensure_ascii=False, indent=2)
    user = FLOW_ANALYSIS_USER.format(cards_json=cards_json, connections_json=connections_json)

    fallback = {
        "summary": f"当前思维链包含 {len(req.cards)} 个卡片和 {len(req.connections)} 个连接。",
        "next_steps": ["尝试探索卡片之间的隐含联系", "思考是否有遗漏的关键角度"],
        "gaps": ["需要更多证据支撑核心论点"],
    }

    try:
        result = chat_json(
            system=FLOW_ANALYSIS_SYSTEM,
            user=user,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
        )
        result = _ensure_dict(result, fallback)
    except Exception as e:
        logger.warning(f"Flow analysis failed, using fallback: {e}")
        result = fallback

    return FlowResponse(
        summary=result.get("summary", ""),
        next_steps=result.get("next_steps", []),
        gaps=result.get("gaps", []),
    )


@router.post("/inquiry", response_model=InquiryResponse)
@limiter.limit("10/minute")
def ai_inquiry(request: Request, req: InquiryRequest):
    """Socratic inquiry on selected cards."""
    cfg = get_cfg()
    cards_json = json.dumps(req.cards, ensure_ascii=False, indent=2)
    question_section = f"用户的追问：{req.question}" if req.question else ""
    user = INQUIRY_USER.format(cards_json=cards_json, question_section=question_section)

    fallback = {
        "analysis": f"已分析 {len(req.cards)} 张卡片的逻辑关系。",
        "challenges": ["这些卡片之间的因果关系是否成立？", "是否存在未被考虑的替代解释？"],
        "suggested_cards": ["这个结论在什么条件下会不成立？", "有没有反面证据需要考虑？"],
    }

    try:
        result = chat_json(
            system=INQUIRY_SYSTEM,
            user=user,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
        )
        result = _ensure_dict(result, fallback)
    except Exception as e:
        logger.warning(f"Inquiry failed, using fallback: {e}")
        result = fallback

    return InquiryResponse(
        analysis=result.get("analysis", ""),
        challenges=result.get("challenges", []),
        suggested_cards=result.get("suggested_cards", []),
    )


@router.post("/discover", response_model=DiscoverResponse)
@limiter.limit("10/minute")
def discover_relationships(request: Request, req: DiscoverRequest):
    """Discover potential relationships between cards."""
    cfg = get_cfg()
    cards_json = json.dumps(req.cards, ensure_ascii=False, indent=2)
    existing_json = json.dumps(req.existing_connections, ensure_ascii=False, indent=2)
    user = DISCOVER_USER.format(
        cards_json=cards_json,
        existing_json=existing_json,
        max_suggestions=req.max_suggestions,
    )

    fallback: dict = {"suggestions": []}

    try:
        result = chat_json(
            system=DISCOVER_SYSTEM,
            user=user,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
        )
        result = _ensure_dict(result, fallback)
    except Exception as e:
        logger.warning(f"Relationship discovery failed, using fallback: {e}")
        result = fallback

    suggestions = result.get("suggestions", [])
    # Validate each suggestion has required fields
    valid = []
    for s in suggestions:
        if isinstance(s, dict) and "from_id" in s and "to_id" in s and "label" in s:
            valid.append({
                "from_id": s["from_id"],
                "to_id": s["to_id"],
                "label": s.get("label", "相关 Related"),
                "reason": s.get("reason", ""),
            })

    return DiscoverResponse(suggestions=valid[:req.max_suggestions])


@router.post("/debate", response_model=DebateResponse)
@limiter.limit("10/minute")
def debate_analysis(request: Request, req: DebateRequest):
    """Perform dialectical analysis on selected cards."""
    cfg = get_cfg()
    cards_json = json.dumps(req.cards, ensure_ascii=False, indent=2)
    stance_label = "反对" if req.stance == "against" else "支持"
    system = DEBATE_SYSTEM.format(stance=stance_label)
    user = DEBATE_USER.format(cards_json=cards_json, stance=stance_label)

    fallback = {
        "thesis": f"这组卡片表达了 {len(req.cards)} 个相关观点。",
        "antithesis": "但从另一个角度来看，这些论点可能存在以下问题：论据不够充分、存在隐含假设、忽略了反面证据。",
        "key_points": ["论据的充分性值得检验", "存在未被验证的隐含假设", "需要考虑反面证据"],
        "synthesis": "综合来看，这些观点有一定道理，但需要更多证据支撑和更严格的逻辑验证。",
    }

    try:
        result = chat_json(
            system=system,
            user=user,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
        )
        result = _ensure_dict(result, fallback)
    except Exception as e:
        logger.warning(f"Debate analysis failed, using fallback: {e}")
        result = fallback

    return DebateResponse(
        thesis=result.get("thesis", ""),
        antithesis=result.get("antithesis", ""),
        key_points=result.get("key_points", []),
        synthesis=result.get("synthesis", ""),
    )


@router.post("/search", response_model=SearchResponse)
@limiter.limit("30/minute")
def semantic_search(request: Request, req: SearchRequest):
    """Semantic search across cards."""
    cfg = get_cfg()
    cards_json = json.dumps(req.cards, ensure_ascii=False, indent=2)
    user = SEARCH_USER.format(query=req.query, cards_json=cards_json, max_results=req.max_results)

    fallback: dict = {"results": []}

    try:
        result = chat_json(
            system=SEARCH_SYSTEM,
            user=user,
            model=cfg.llm.keywords.model,
            max_tokens=cfg.llm.keywords.max_tokens,
            temperature=cfg.llm.keywords.temperature,
        )
        result = _ensure_dict(result, fallback)
    except Exception as e:
        logger.warning(f"Semantic search failed, using fallback: {e}")
        result = fallback

    results = result.get("results", [])
    valid = []
    for r in results:
        if isinstance(r, dict) and "id" in r:
            valid.append({
                "id": r["id"],
                "score": float(r.get("score", 0.5)),
                "reason": r.get("reason", ""),
            })

    return SearchResponse(results=valid[:req.max_results])


@router.post("/chat", response_model=ChatResponse)
@limiter.limit("10/minute")
def general_chat(request: Request, req: ChatRequest):
    """General-purpose AI chat with full canvas context."""
    cfg = get_cfg()

    # Build canvas context summary
    ctx = req.canvas_context
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
        group_lines = [f"  {g['name']}: 卡片 {g['cardIds']}" for g in groups]
        context_parts.append(f"卡片分组 ({len(groups)} 个):\n" + "\n".join(group_lines))

    canvas_summary = "\n\n".join(context_parts) if context_parts else "画布当前为空。"

    system_prompt = f"""你是 Nexus 外脑思维链路管理系统的 AI 助手。你可以看到用户画布上的所有卡片、连接和分组。

你的职责：
- 帮助用户理解和分析他们的思维结构
- 回答关于画布内容的任何问题
- 提供洞察、质疑、建议和新的思考角度
- 帮助用户发现思维中的盲点和逻辑漏洞
- 用中文回答，技术术语可用英文

当前画布上下文：
{canvas_summary}"""

    # Build messages array for multi-turn
    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    fallback = "抱歉，AI 暂时无法响应。请稍后再试。"

    try:
        reply = chat_multi(
            system=system_prompt,
            messages=messages,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
        )
    except Exception as e:
        logger.error(f"Chat failed: {e}")
        reply = fallback

    return ChatResponse(reply=reply)


@router.post("/tool-result")
def submit_tool_result(req: ToolResultRequest):
    """Receive tool execution results from the frontend for relay to Claude."""
    with _tool_result_lock:
        if req.session_id not in _tool_result_buffers:
            _tool_result_buffers[req.session_id] = {}
        _tool_result_buffers[req.session_id][req.tool_use_id] = req.result
        # Signal the waiting streaming handler
        event = _tool_result_events.get(req.session_id)
        if event:
            event.set()
    return {"ok": True}


def _wait_for_tool_result(session_id: str, tool_use_id: str, timeout: float = 30.0) -> str:
    """Wait for the frontend to POST a tool result. Returns the result string."""
    with _tool_result_lock:
        buf = _tool_result_buffers.get(session_id, {})
        if tool_use_id in buf:
            return buf.pop(tool_use_id)
        # Create event to wait on
        if session_id not in _tool_result_events:
            _tool_result_events[session_id] = threading.Event()
        event = _tool_result_events[session_id]
        event.clear()

    # Wait outside the lock
    event.wait(timeout=timeout)

    with _tool_result_lock:
        buf = _tool_result_buffers.get(session_id, {})
        result = buf.pop(tool_use_id, "Tool executed successfully.")
        # Cleanup if no more pending results
        if not buf and session_id in _tool_result_buffers:
            del _tool_result_buffers[session_id]
        if session_id in _tool_result_events:
            del _tool_result_events[session_id]
        return result


@router.post("/chat/stream")
@limiter.limit("10/minute")
def chat_stream(request: Request, req: ChatRequest):
    """Streaming AI chat with function calling support."""
    cfg = get_cfg()

    # Build canvas context summary
    ctx = req.canvas_context
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
        group_lines = [f"  {g['name']}: 卡片 {g['cardIds']}" for g in groups]
        context_parts.append(f"卡片分组 ({len(groups)} 个):\n" + "\n".join(group_lines))

    canvas_summary = "\n\n".join(context_parts) if context_parts else "画布当前为空。"

    # Available relationship labels from active packs
    active_labels = ctx.get("active_labels", [])
    labels_hint = ""
    if active_labels:
        labels_hint = f"\n\n可用的关系类型（创建连接时必须从中选择）：\n" + "\n".join(f"  - {l}" for l in active_labels)

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

    messages = [{"role": m.role, "content": m.content} for m in req.messages]

    def process_round(msgs):
        """Run one API round. Yields SSE events, returns list of tool_uses."""
        tool_uses = []
        current_tool_id = None
        current_tool_name = None
        current_tool_json = ""

        with chat_multi_stream(
            system=system_prompt,
            messages=msgs,
            model=cfg.llm.flow.model,
            max_tokens=cfg.llm.flow.max_tokens,
            temperature=cfg.llm.flow.temperature,
            tools=CANVAS_TOOLS,
        ) as stream:
            for event in stream:
                if event.type == "content_block_start":
                    if event.content_block.type == "text":
                        yield ("event", f"data: {json.dumps({'type': 'text_start'})}\n\n")
                    elif event.content_block.type == "tool_use":
                        current_tool_id = event.content_block.id
                        current_tool_name = event.content_block.name
                        current_tool_json = ""
                        yield ("event", f"data: {json.dumps({'type': 'tool_start', 'id': current_tool_id, 'name': current_tool_name})}\n\n")
                elif event.type == "content_block_delta":
                    if event.delta.type == "text_delta":
                        yield ("event", f"data: {json.dumps({'type': 'text', 'text': event.delta.text})}\n\n")
                    elif event.delta.type == "input_json_delta":
                        current_tool_json += event.delta.partial_json
                        yield ("event", f"data: {json.dumps({'type': 'tool_delta', 'json': event.delta.partial_json})}\n\n")
                elif event.type == "content_block_stop":
                    if current_tool_name and current_tool_json:
                        tool_uses.append({
                            "id": current_tool_id,
                            "name": current_tool_name,
                            "input": current_tool_json,
                        })
                    current_tool_name = None
                    current_tool_json = ""
                    yield ("event", f"data: {json.dumps({'type': 'block_stop'})}\n\n")
                elif event.type == "message_stop":
                    yield ("event", f"data: {json.dumps({'type': 'message_stop'})}\n\n")

        yield ("done", tool_uses)

    session_id = req.session_id

    def event_stream():
        try:
            max_rounds = 3
            for _ in range(max_rounds):
                tool_uses = []
                for kind, data in process_round(messages):
                    if kind == "event":
                        yield data
                    else:
                        tool_uses = data

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
                messages.append({"role": "assistant", "content": assistant_content})

                # Build tool_result messages — wait for actual results from frontend
                tool_results = []
                for tu in tool_uses:
                    if session_id:
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
            # Cleanup tool result buffers for this session
            if session_id:
                with _tool_result_lock:
                    _tool_result_buffers.pop(session_id, None)
                    _tool_result_events.pop(session_id, None)

    return StreamingResponse(event_stream(), media_type="text/event-stream")
