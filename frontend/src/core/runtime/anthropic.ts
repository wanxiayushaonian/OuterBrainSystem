// ═══════════════════════════════════════════════════════
// Anthropic runtime adapter — SSE bridge to backend
// ═══════════════════════════════════════════════════════
import type { ChatRuntime, StreamChunk, CanvasContext } from './types';

export class AnthropicRuntime implements ChatRuntime {
  private abortController: AbortController | null = null;

  async sendMessage(
    input: string,
    context: CanvasContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void> {
    this.abortController = new AbortController();

    // Track current tool call being accumulated
    let currentToolId: string | null = null;
    let currentToolName: string | null = null;
    let currentToolJson = '';

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: (window as any).__currentSessionId || 'default',
          provider_id: 'anthropic',
          input,
          context: {
            cards: context.cards,
            connections: context.connections,
            groups: context.groups,
            active_labels: context.active_labels
          }
        }),
        signal: this.abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          let data: any;
          try {
            data = JSON.parse(line.slice(6));
          } catch (e) {
            console.warn('Failed to parse SSE data:', line, e);
            continue;
          }

          switch (data.type) {
            case 'text':
              onChunk({ type: 'text', content: data.text });
              break;

            case 'tool_start':
              // Begin accumulating a new tool call
              currentToolId = data.id;
              currentToolName = data.name;
              currentToolJson = '';
              break;

            case 'tool_delta':
              // Accumulate tool call JSON arguments
              currentToolJson += data.json || '';
              break;

            case 'block_stop':
              // A content block finished — if it was a tool call, emit it
              if (currentToolId && currentToolName && currentToolJson) {
                let args: Record<string, any> = {};
                try {
                  args = JSON.parse(currentToolJson);
                } catch {
                  console.warn('Failed to parse tool args:', currentToolJson);
                }
                onChunk({
                  type: 'tool_call',
                  tool_call: {
                    id: currentToolId,
                    name: currentToolName,
                    arguments: args
                  }
                });

                // POST tool result back to backend so it can continue
                this.sendToolResult(currentToolId, 'Tool executed successfully.');
              }
              currentToolId = null;
              currentToolName = null;
              currentToolJson = '';
              break;

            case 'agent_result':
              // L3 agent tool executed server-side — notify frontend
              onChunk({
                type: 'tool_call',
                tool_call: {
                  id: `agent_${data.tool}`,
                  name: data.tool,
                  arguments: data.result || {}
                }
              });
              break;

            case 'message_stop':
              onChunk({ type: 'done' });
              break;

            case 'error':
              onChunk({ type: 'error', error: data.message || 'Unknown error' });
              break;
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted');
        return;
      }
      onChunk({
        type: 'error',
        error: error.message || 'Unknown error'
      });
    } finally {
      this.abortController = null;
    }
  }

  private async sendToolResult(toolUseId: string, result: string): Promise<void> {
    try {
      const sessionId = (window as any).__currentSessionId || 'default';
      await fetch('/api/llm/tool-result', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          tool_use_id: toolUseId,
          result
        })
      });
    } catch (e) {
      console.warn('Failed to send tool result:', e);
    }
  }

  cleanup() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }
}
