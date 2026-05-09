// ═══════════════════════════════════════════════════════
// Session types
// ═══════════════════════════════════════════════════════

export interface Session {
  id: string;
  space_id: number;
  provider_id: string;
  title: string;
  messages: Message[];
  created_at: string;
  updated_at: string;
}

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
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
