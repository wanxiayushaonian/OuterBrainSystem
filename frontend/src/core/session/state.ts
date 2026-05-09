// ═══════════════════════════════════════════════════════
// Session state management with callback-based updates
// ═══════════════════════════════════════════════════════
import type { Message } from './types';

/**
 * Session state with reactive updates
 */
export class SessionState {
  private messages: Message[] = [];
  private isStreaming = false;
  private currentToolCalls: any[] = [];
  private thinkingBlocks: any[] = [];

  // Callbacks for state changes
  private messagesListeners = new Set<(messages: Message[]) => void>();
  private streamingListeners = new Set<(isStreaming: boolean) => void>();
  private toolCallListeners = new Set<(toolCalls: any[]) => void>();

  // ── Messages ──────────────────────────────────────────
  getMessages(): Message[] {
    return [...this.messages];
  }

  setMessages(messages: Message[]): void {
    this.messages = messages;
    this.notifyMessagesChanged();
  }

  addMessage(message: Message): void {
    this.messages.push(message);
    this.notifyMessagesChanged();
  }

  updateLastMessage(content: string): void {
    if (this.messages.length === 0) return;
    const lastMessage = this.messages[this.messages.length - 1];
    lastMessage.content = content;
    this.notifyMessagesChanged();
  }

  clearMessages(): void {
    this.messages = [];
    this.notifyMessagesChanged();
  }

  // ── Streaming state ───────────────────────────────────
  getIsStreaming(): boolean {
    return this.isStreaming;
  }

  setIsStreaming(isStreaming: boolean): void {
    this.isStreaming = isStreaming;
    this.notifyStreamingChanged();
  }

  // ── Tool calls ────────────────────────────────────────
  getToolCalls(): any[] {
    return [...this.currentToolCalls];
  }

  addToolCall(toolCall: any): void {
    this.currentToolCalls.push(toolCall);
    this.notifyToolCallsChanged();
  }

  clearToolCalls(): void {
    this.currentToolCalls = [];
    this.notifyToolCallsChanged();
  }

  // ── Thinking blocks ───────────────────────────────────
  getThinkingBlocks(): any[] {
    return [...this.thinkingBlocks];
  }

  addThinkingBlock(block: any): void {
    this.thinkingBlocks.push(block);
  }

  clearThinkingBlocks(): void {
    this.thinkingBlocks = [];
  }

  // ── Subscriptions ─────────────────────────────────────
  onMessagesChanged(callback: (messages: Message[]) => void): () => void {
    this.messagesListeners.add(callback);
    return () => this.messagesListeners.delete(callback);
  }

  onStreamingStateChanged(callback: (isStreaming: boolean) => void): () => void {
    this.streamingListeners.add(callback);
    return () => this.streamingListeners.delete(callback);
  }

  onToolCallsChanged(callback: (toolCalls: any[]) => void): () => void {
    this.toolCallListeners.add(callback);
    return () => this.toolCallListeners.delete(callback);
  }

  // ── Notifications ─────────────────────────────────────
  private notifyMessagesChanged(): void {
    this.messagesListeners.forEach(fn => fn(this.getMessages()));
  }

  private notifyStreamingChanged(): void {
    this.streamingListeners.forEach(fn => fn(this.isStreaming));
  }

  private notifyToolCallsChanged(): void {
    this.toolCallListeners.forEach(fn => fn(this.getToolCalls()));
  }

  // ── Reset ─────────────────────────────────────────────
  reset(): void {
    this.messages = [];
    this.isStreaming = false;
    this.currentToolCalls = [];
    this.thinkingBlocks = [];
    this.notifyMessagesChanged();
    this.notifyStreamingChanged();
    this.notifyToolCallsChanged();
  }
}
