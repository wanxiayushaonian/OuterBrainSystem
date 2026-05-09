// ═══════════════════════════════════════════════════════
// SessionState unit tests
// ═══════════════════════════════════════════════════════
import { SessionState } from '../state';
import type { Message } from '../types';

describe('SessionState', () => {
  let state: SessionState;

  beforeEach(() => {
    state = new SessionState();
  });

  describe('Messages', () => {
    it('should start with empty messages', () => {
      expect(state.getMessages()).toEqual([]);
    });

    it('should add messages', () => {
      const msg: Message = { role: 'user', content: 'hello' };
      state.addMessage(msg);
      expect(state.getMessages()).toEqual([msg]);
    });

    it('should set messages', () => {
      const messages: Message[] = [
        { role: 'user', content: 'hello' },
        { role: 'assistant', content: 'hi' },
      ];
      state.setMessages(messages);
      expect(state.getMessages()).toEqual(messages);
    });

    it('should update last message', () => {
      state.addMessage({ role: 'user', content: 'hello' });
      state.updateLastMessage('world');
      expect(state.getMessages()[0].content).toBe('world');
    });

    it('should not update if no messages', () => {
      state.updateLastMessage('world');
      expect(state.getMessages()).toEqual([]);
    });

    it('should clear messages', () => {
      state.addMessage({ role: 'user', content: 'hello' });
      state.clearMessages();
      expect(state.getMessages()).toEqual([]);
    });

    it('should return copy of messages', () => {
      const msg: Message = { role: 'user', content: 'hello' };
      state.addMessage(msg);
      const messages = state.getMessages();
      messages.push({ role: 'assistant', content: 'hi' });
      expect(state.getMessages()).toHaveLength(1);
    });
  });

  describe('Streaming state', () => {
    it('should start with streaming false', () => {
      expect(state.getIsStreaming()).toBe(false);
    });

    it('should set streaming state', () => {
      state.setIsStreaming(true);
      expect(state.getIsStreaming()).toBe(true);
    });
  });

  describe('Tool calls', () => {
    it('should start with empty tool calls', () => {
      expect(state.getToolCalls()).toEqual([]);
    });

    it('should add tool calls', () => {
      const toolCall = { name: 'test', arguments: {} };
      state.addToolCall(toolCall);
      expect(state.getToolCalls()).toEqual([toolCall]);
    });

    it('should clear tool calls', () => {
      state.addToolCall({ name: 'test', arguments: {} });
      state.clearToolCalls();
      expect(state.getToolCalls()).toEqual([]);
    });
  });

  describe('Subscriptions', () => {
    it('should notify on messages changed', () => {
      const callback = jest.fn();
      state.onMessagesChanged(callback);
      state.addMessage({ role: 'user', content: 'hello' });
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe', () => {
      const callback = jest.fn();
      const unsubscribe = state.onMessagesChanged(callback);
      unsubscribe();
      state.addMessage({ role: 'user', content: 'hello' });
      expect(callback).not.toHaveBeenCalled();
    });

    it('should notify on streaming changed', () => {
      const callback = jest.fn();
      state.onStreamingStateChanged(callback);
      state.setIsStreaming(true);
      expect(callback).toHaveBeenCalledWith(true);
    });

    it('should notify on tool calls changed', () => {
      const callback = jest.fn();
      state.onToolCallsChanged(callback);
      state.addToolCall({ name: 'test', arguments: {} });
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe('Reset', () => {
    it('should reset all state', () => {
      state.addMessage({ role: 'user', content: 'hello' });
      state.setIsStreaming(true);
      state.addToolCall({ name: 'test', arguments: {} });

      state.reset();

      expect(state.getMessages()).toEqual([]);
      expect(state.getIsStreaming()).toBe(false);
      expect(state.getToolCalls()).toEqual([]);
    });
  });
});
