"""Chat API endpoints using provider-neutral runtime."""
import os
import json
from dataclasses import asdict
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional

from src.core import (
    ProviderRegistry,
    ToolRegistry,
    SessionManager,
    Message,
    CanvasContext,
    StreamChunk
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

MAX_AGENT_ITERATIONS = 10


class ChatRequest(BaseModel):
    """Chat request model."""
    session_id: str
    provider_id: str
    input: str
    context: Dict[str, Any]


async def stream_chat_response(
    session_id: str,
    provider_id: str,
    user_input: str,
    canvas_context: CanvasContext,
    session_manager: SessionManager
):
    """Stream chat response with SSE - implements agent loop for multi-turn tool calls."""
    try:
        # Get session
        session = await session_manager.get_session(session_id)
        if not session:
            yield f"data: {json.dumps({'type': 'error', 'error': 'Session not found'})}\n\n"
            return

        # Create runtime with API key from environment
        api_key = os.environ.get("ANTHROPIC_API_KEY") or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        if not api_key:
            yield f"data: {json.dumps({'type': 'error', 'error': 'ANTHROPIC_API_KEY not set'})}\n\n"
            return

        base_url = os.environ.get("ANTHROPIC_BASE_URL")
        model = os.environ.get("ANTHROPIC_MODEL")

        runtime = ProviderRegistry.create_runtime(
            provider_id,
            api_key=api_key,
            base_url=base_url,
            model=model
        )

        # Add user message to session
        user_message = Message(role="user", content=user_input)
        await session_manager.add_message(session_id, user_message)

        # Get tool schemas
        tools = ToolRegistry.get_schemas()

        # ── Agent loop ────────────────────────────────────
        # Accumulate all content and tool calls across iterations
        all_assistant_content = ""
        all_tool_calls = []

        for iteration in range(MAX_AGENT_ITERATIONS):
            assistant_content = ""
            tool_calls = []

            # Stream one turn (filter out intermediate done events)
            async for chunk in runtime.stream_chat(
                messages=session.messages,
                tools=tools,
                context=canvas_context
            ):
                # Skip done from stream_chat — we send it once at the end
                if chunk.type == "done":
                    continue

                # Send chunk to frontend
                yield f"data: {json.dumps(asdict(chunk))}\n\n"

                # Accumulate
                if chunk.type == "text":
                    assistant_content += chunk.content or ""
                elif chunk.type == "tool_call" and chunk.tool_call:
                    tool_calls.append(chunk.tool_call)

            # Accumulate across iterations
            if assistant_content:
                all_assistant_content += assistant_content
            if tool_calls:
                all_tool_calls.extend(tool_calls)

            # If no tool calls, agent turn is complete
            if not tool_calls:
                break

            # Execute tools and collect results
            tool_results = []
            for tool_call in tool_calls:
                result = await runtime.execute_tool(tool_call, canvas_context)
                tool_results.append(result)

                # Send tool result to frontend
                yield f"data: {json.dumps({'type': 'tool_result', 'tool_result': asdict(result)})}\n\n"

            # Save tool results as user message (Anthropic format)
            tool_message = Message(
                role="user",
                tool_results=tool_results
            )
            await session_manager.add_message(session_id, tool_message)

            # Refresh session for next iteration
            session = await session_manager.get_session(session_id)
            if not session:
                break

        # Save final assistant message with all content and tool calls
        if all_assistant_content or all_tool_calls:
            assistant_message = Message(
                role="assistant",
                content=all_assistant_content if all_assistant_content else None,
                tool_calls=all_tool_calls if all_tool_calls else None
            )
            await session_manager.add_message(session_id, assistant_message)

        # Send done once at the end of the entire agent loop
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

        # Cleanup
        await runtime.cleanup()

    except Exception as e:
        yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """Stream chat endpoint.

    Returns:
        SSE stream of chat responses
    """
    from src.core.session import SessionStorage
    from src.core.context_manager import ContextManager

    storage = SessionStorage()
    await storage.init_db()
    session_manager = SessionManager(storage)

    # Use Context Manager for hybrid loading
    ctx = request.context
    context_manager = ContextManager()

    # Load context with hybrid strategy
    hybrid_context = context_manager.load_context_from_state(
        state=ctx,
        viewport=ctx.get("viewport", {})
    )

    # Convert to old CanvasContext format for backward compatibility
    # Use core_cards (full content) for now
    # TODO: Update system prompt to include peripheral_cards as index
    canvas_context = CanvasContext(
        cards=hybrid_context.core_cards,
        connections=hybrid_context.connections,
        groups=hybrid_context.groups,
        active_labels=hybrid_context.active_labels
    )

    # Log context stats for monitoring
    print(f"Context loaded: {len(hybrid_context.core_cards)} core cards, "
          f"{len(hybrid_context.peripheral_cards)} peripheral cards, "
          f"{hybrid_context.total_cards} total")

    return StreamingResponse(
        stream_chat_response(
            request.session_id,
            request.provider_id,
            request.input,
            canvas_context,
            session_manager
        ),
        media_type="text/event-stream"
    )
