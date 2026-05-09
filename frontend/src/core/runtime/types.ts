// ═══════════════════════════════════════════════════════
// Runtime types and interfaces
// ═══════════════════════════════════════════════════════

export interface ChatRuntime {
  sendMessage(
    input: string,
    context: CanvasContext,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<void>;

  cleanup(): void;
}

export interface StreamChunk {
  type: 'text' | 'tool_call' | 'tool_result' | 'thinking' | 'done' | 'error';
  content?: string;
  tool_call?: ToolCall;
  tool_result?: ToolResult;
  error?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ToolResult {
  tool_call_id: string;
  content: any;
  is_error?: boolean;
}

export interface CanvasContext {
  cards: any[];
  connections: any[];
  groups: any[];
  active_labels: string[];
}
