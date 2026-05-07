// ═══════════════════════════════════════════════════════
// AI Chat Panel — Refactored to use new runtime and session management
// ═══════════════════════════════════════════════════════
import { state, scheduleSave, pushUndo, getAllLabels } from '../../core/types/state';
import { t } from '../../i18n';
import { renderCanvas, renderConnections } from '../canvas/renderer';
import { autoLayout } from '../canvas/layout';
import { showToast } from '../../shared/components/toast';
import { RuntimeFactory } from '../../core/runtime';
import { sessionManager } from '../../core/session';
import { MentionParser } from '../../context';
import { handleError } from '../../shared/utils/error';
import type { StreamChunk } from '../../core/runtime/types';

let viewMode: 'list' | 'chat' = 'list';
let toolBatchIndex = 0;
let newCardIds: number[] = [];
let isStreaming = false;
let currentRuntime: ReturnType<typeof RuntimeFactory.create> | null = null;

function setStreamingUI(streaming: boolean): void {
  const sendBtn = document.getElementById('aiSendBtn');
  const stopBtn = document.getElementById('aiStopBtn');
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  if (sendBtn) sendBtn.style.display = streaming ? 'none' : '';
  if (stopBtn) stopBtn.style.display = streaming ? '' : 'none';
  if (input) input.disabled = streaming;
}

// ── Canvas context ──────────────────────────────────────
function getCanvasContext() {
  const canvasCards = state.cards.filter(c => c.inCanvas).map(c => ({
    id: c.id,
    text: c.text,
    status: c.status,
    openQuestion: c.openQuestion,
  }));
  return {
    cards: canvasCards,
    connections: state.connections,
    groups: state.groups.map(g => ({ name: g.name, cardIds: g.cardIds })),
    active_labels: getAllLabels(),
  };
}

// ── Formatting ──────────────────────────────────────────
function escapeHtml(str: string | null | undefined): string {
  return (str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatReply(text: string | null | undefined): string {
  let html = escapeHtml(text);
  html = html.replace(/^### (.+)$/gm, '<strong style="font-size:13px">$1</strong>');
  html = html.replace(/^## (.+)$/gm, '<strong style="font-size:14px">$1</strong>');
  html = html.replace(/^# (.+)$/gm, '<strong style="font-size:15px">$1</strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');
  html = html.replace(/^---$/gm, '<hr style="border:none;border-top:1px solid var(--border);margin:8px 0">');
  html = html.replace(/^[*-] (.+)$/gm, '• $1');
  html = html.replace(/\n/g, '<br>');
  return html;
}

// ── Tool permission levels ───────────────────────────────
type ToolPermission = 'read_only' | 'write' | 'destructive';

const TOOL_PERMISSIONS: Record<string, ToolPermission> = {
  add_card: 'write',
  edit_card: 'write',
  delete_card: 'destructive',
  move_card: 'write',
  add_connection: 'write',
  delete_connection: 'destructive',
  search_cards: 'read_only',
  analyze_canvas: 'read_only',
};

// ── Approval dialog ──────────────────────────────────────
let pendingApproval: { resolve: (v: boolean) => void } | null = null;
let yoloMode = false; // YOLO mode: auto-approve all operations

function showApprovalDialog(toolName: string, args: Record<string, unknown>): Promise<boolean> {
  // YOLO mode: auto-approve
  if (yoloMode) {
    console.log(`[YOLO] Auto-approved: ${toolName}`, args);
    return Promise.resolve(true);
  }

  return new Promise(resolve => {
    pendingApproval = { resolve };

    const desc = getToolDescription(toolName, args);
    const modal = document.getElementById('deleteSessionModal');
    // Reuse modal style but with custom content
    const overlay = document.createElement('div');
    overlay.className = 'approval-overlay';
    overlay.innerHTML = `
      <div class="approval-dialog">
        <h4>AI 请求执行操作</h4>
        <p class="approval-desc">${desc}</p>
        <div class="approval-actions">
          <button class="approval-deny">拒绝</button>
          <button class="approval-allow primary">允许</button>
          <button class="approval-yolo" title="自动批准所有后续操作">🚀 YOLO</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('.approval-deny')!.addEventListener('click', () => {
      cleanup(false);
    });
    overlay.querySelector('.approval-allow')!.addEventListener('click', () => {
      cleanup(true);
    });
    overlay.querySelector('.approval-yolo')!.addEventListener('click', () => {
      yoloMode = true;
      showToast('🚀 YOLO 模式已启用：所有操作将自动批准', 'success');
      cleanup(true);
    });

    function cleanup(result: boolean) {
      overlay.remove();
      pendingApproval = null;
      resolve(result);
    }
  });
}

function getToolDescription(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'delete_card':
      return `删除卡片 #${args.card_id}（关联的连接也会被删除）`;
    case 'delete_connection':
      return `删除卡片 #${args.from} 到 #${args.to} 的连接`;
    case 'edit_card':
      return `修改卡片 #${args.card_id} 的内容`;
    case 'move_card':
      return `移动卡片 #${args.card_id} 到新位置`;
    case 'add_card':
      return `创建新卡片："${(args.text as string || '').slice(0, 30)}..."`;
    case 'add_connection':
      return `在卡片 #${args.from} 和 #${args.to} 之间创建 "${args.label}" 连接`;
    default:
      return `执行 ${toolName}`;
  }
}

// ── Tool execution ──────────────────────────────────────
async function executeTool(toolName: string, toolInput: Record<string, unknown>): Promise<number | undefined> {
  const permission = TOOL_PERMISSIONS[toolName] || 'read_only';

  // Ask for approval on write and destructive tools
  if (permission !== 'read_only') {
    const approved = await showApprovalDialog(toolName, toolInput);
    if (!approved) return undefined;
  }

  switch (toolName) {
    case 'add_card':
      return executeAddCard(toolInput);
    case 'edit_card':
      return executeEditCard(toolInput);
    case 'delete_card':
      return executeDeleteCard(toolInput);
    case 'move_card':
      return executeMoveCard(toolInput);
    case 'add_connection':
      return executeAddConnection(toolInput);
    case 'delete_connection':
      return executeDeleteConnection(toolInput);
    default:
      return undefined;
  }
}

function executeAddCard(toolInput: Record<string, unknown>): number {
  pushUndo();
  const COLS = 3;
  const COL_SPACING = 280;
  const ROW_SPACING = 180;
  const refX = 200;
  const refY = 200;
  const col = toolBatchIndex % COLS;
  const row = Math.floor(toolBatchIndex / COLS);
  const x = Math.round(refX + (col === 0 && toolBatchIndex > 0 ? COL_SPACING : 0) + col * 20);
  const y = Math.round(refY + row * ROW_SPACING);
  toolBatchIndex++;

  const id = state.nextId++;
  state.cards.push({
    id,
    text: toolInput.text as string,
    source: toolInput.source as string,
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: '',
    inCanvas: true,
    x: toolInput.x !== undefined ? (toolInput.x as number) : x,
    y: toolInput.y !== undefined ? (toolInput.y as number) : y,
  });
  newCardIds.push(id);
  if (!isStreaming) {
    renderCanvas();
    renderConnections();
  }
  scheduleSave();
  return id;
}

function executeEditCard(toolInput: Record<string, unknown>): undefined {
  pushUndo();
  const cardId = toolInput.card_id as number;
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return undefined;
  if (toolInput.text !== undefined) card.text = toolInput.text as string;
  if (toolInput.status !== undefined) card.status = toolInput.status as '' | 'pending' | 'verified' | 'conclusion';
  if (!isStreaming) {
    renderCanvas();
  }
  scheduleSave();
  return undefined;
}

function executeDeleteCard(toolInput: Record<string, unknown>): undefined {
  pushUndo();
  const cardId = toolInput.card_id as number;
  state.cards = state.cards.filter(c => c.id !== cardId);
  state.connections = state.connections.filter(
    c => c.from !== cardId && c.to !== cardId
  );
  if (!isStreaming) {
    renderCanvas();
    renderConnections();
  }
  scheduleSave();
  return undefined;
}

function executeMoveCard(toolInput: Record<string, unknown>): undefined {
  const cardId = toolInput.card_id as number;
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return undefined;
  card.x = toolInput.x as number;
  card.y = toolInput.y as number;
  if (!isStreaming) {
    renderCanvas();
  }
  scheduleSave();
  return undefined;
}

function executeAddConnection(toolInput: Record<string, unknown>): undefined {
  pushUndo();
  const from = toolInput.from as number;
  const to = toolInput.to as number;
  const label = toolInput.label as string;
  const fromCard = state.cards.find(c => c.id === from);
  const toCard = state.cards.find(c => c.id === to);
  if (!fromCard || !toCard) return undefined;
  state.connections.push({ from, to, label });
  if (!isStreaming) {
    renderCanvas();
    renderConnections();
  }
  scheduleSave();
  return undefined;
}

function executeDeleteConnection(toolInput: Record<string, unknown>): undefined {
  pushUndo();
  const from = toolInput.from as number;
  const to = toolInput.to as number;
  state.connections = state.connections.filter(
    c => !(c.from === from && c.to === to)
  );
  if (!isStreaming) {
    renderCanvas();
    renderConnections();
  }
  scheduleSave();
  return undefined;
}

// ── Chat rendering ──────────────────────────────────────
async function renderSessionList(): Promise<void> {
  const listContainer = document.getElementById('aiConvList');
  if (!listContainer) return;

  try {
    const sessions = await sessionManager.listSessions(state.currentSpaceId || 1);
    const currentSessionId = sessionManager.getCurrentSessionId();

    if (sessions.length === 0) {
      listContainer.innerHTML = `
        <div class="ai-welcome">
          <div class="ai-welcome-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          </div>
          <div class="ai-welcome-text">还没有会话记录</div>
          <div class="ai-welcome-hint">点击"新对话"开始</div>
        </div>`;
      return;
    }

    listContainer.innerHTML = sessions.map(s => {
      const isActive = s.id === currentSessionId;
      const createdAt = typeof s.created_at === 'number' ? s.created_at : Date.parse(s.created_at as string) / 1000;
      const date = new Date(createdAt * 1000);
      const dateStr = date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
      const messageCount = s.messages?.length || 0;

      return `
        <div class="session-item ${isActive ? 'active' : ''}" data-session-id="${s.id}">
          <div class="session-item-header">
            <div class="session-item-title">${escapeHtml(s.title)}</div>
            <button class="session-item-delete" data-session-id="${s.id}" title="删除会话">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
            </button>
          </div>
          <div class="session-item-meta">
            <span>${dateStr} ${timeStr}</span>
            <span>•</span>
            <span>${messageCount} 条消息</span>
          </div>
        </div>
      `;
    }).join('');

    // Attach event listeners
    listContainer.querySelectorAll('.session-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const target = e.target as HTMLElement;
        if (target.closest('.session-item-delete')) return;

        const sessionId = (item as HTMLElement).dataset.sessionId;
        if (!sessionId) return;

        await sessionManager.loadSession(sessionId);
        showChatView();
        await renderChatHistory();
      });
    });

    listContainer.querySelectorAll('.session-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const sessionId = (btn as HTMLElement).dataset.sessionId;
        if (!sessionId) return;

        showDeleteSessionModal(sessionId);
      });
    });
  } catch (error) {
    handleError(error, 'renderSessionList');
    listContainer.innerHTML = '<div class="ai-welcome-text">加载会话列表失败</div>';
  }
}

// ── Delete session modal ────────────────────────────────
let pendingDeleteSessionId: string | null = null;

function showDeleteSessionModal(sessionId: string): void {
  pendingDeleteSessionId = sessionId;
  const modal = document.getElementById('deleteSessionModal');
  if (modal) {
    modal.classList.add('show');
    modal.style.display = 'block';
    modal.style.pointerEvents = 'auto';
  }
}

function closeDeleteSessionModal(): void {
  pendingDeleteSessionId = null;
  const modal = document.getElementById('deleteSessionModal');
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
}

async function confirmDeleteSession(): Promise<void> {
  if (!pendingDeleteSessionId) return;

  try {
    await sessionManager.deleteSession(pendingDeleteSessionId);
    showToast('会话已删除');

    // Refresh list view
    if (viewMode === 'list') {
      await renderSessionList();
    }

    // Refresh session tabs at top
    const { renderSessionTabs, removeClosedTabId } = await import('../../shared/components/session-tabs');
    removeClosedTabId(pendingDeleteSessionId!);
    await renderSessionTabs();
  } catch (error) {
    handleError(error, 'confirmDeleteSession');
  } finally {
    closeDeleteSessionModal();
  }
}

async function renderChatHistory(): Promise<void> {
  const messages = document.getElementById('aiMessages');
  if (!messages) return;

  const session = sessionManager.getCurrentSession();
  if (!session || session.messages.length === 0) {
    messages.innerHTML = `
      <div class="ai-welcome">
        <div class="ai-welcome-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="32" height="32" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        </div>
        <div class="ai-welcome-text">我可以帮你分析画布上的思维结构、质疑你的假设、发现逻辑漏洞。</div>
        <div class="ai-welcome-hint">试试问我："我的思维链有什么漏洞？"</div>
      </div>`;
    return;
  }

  messages.innerHTML = session.messages
    .filter(msg => {
      // Skip tool-result-only user messages (no displayable content)
      if (msg.role === 'user' && !msg.content && msg.tool_results?.length) return false;
      // Skip assistant messages with no content and no tool_calls
      if (msg.role === 'assistant' && !msg.content && !msg.tool_calls?.length) return false;
      return true;
    })
    .map(msg => {
      if (msg.role === 'user') {
        return `<div class="ai-msg user"><div class="ai-msg-body">${formatReply(msg.content)}</div></div>`;
      }
      // Assistant message
      let body = '';
      if (msg.content) {
        body += formatReply(msg.content);
      }
      if (msg.tool_calls?.length) {
        const listId = `tc-${Math.random().toString(36).slice(2, 8)}`;
        const items = msg.tool_calls.map(tc =>
          `<div class="tool-call-item">${escapeHtml(getToolDescription(tc.name, tc.arguments || {}))}</div>`
        ).join('');
        body += `<div class="tool-calls-summary">
          <span class="tool-calls-toggle" onclick="this.classList.toggle('open');document.getElementById('${listId}').classList.toggle('open')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
            ${msg.tool_calls.length} 次工具调用
          </span>
          <div class="tool-calls-list" id="${listId}">${items}</div>
        </div>`;
      }
      return `<div class="ai-msg ai"><div class="ai-msg-body">${body}</div></div>`;
    }).join('');

  messages.scrollTop = messages.scrollHeight;
}

function appendToLastAiMessage(text: string): void {
  const messages = document.getElementById('aiMessages');
  if (!messages) return;

  let streamingEl = messages.querySelector('.ai-msg.streaming');
  if (!streamingEl) {
    streamingEl = document.createElement('div');
    streamingEl.className = 'ai-msg ai streaming';
    streamingEl.innerHTML = '<div class="ai-msg-body"></div>';
    messages.appendChild(streamingEl);
  }

  const body = streamingEl.querySelector('.ai-msg-body')!;

  // Use a text container to avoid overwriting tool calls
  let textContainer = body.querySelector('.ai-text-content');
  if (!textContainer) {
    textContainer = document.createElement('div');
    textContainer.className = 'ai-text-content';
    body.insertBefore(textContainer, body.firstChild);
  }
  textContainer.innerHTML += formatReply(text);
  messages.scrollTop = messages.scrollHeight;
}

// ── Thinking block helpers ───────────────────────────────
let currentThinkingEl: HTMLElement | null = null;

function createThinkingBlock(container: HTMLElement | null): void {
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'ai-thinking';
  el.innerHTML = `
    <div class="ai-thinking-header">
      <div class="ai-thinking-spinner"></div>
      <span>思考中…</span>
      <span class="ai-thinking-duration"></span>
    </div>
    <div class="ai-thinking-body"></div>
  `;
  el.querySelector('.ai-thinking-header')!.addEventListener('click', () => {
    el.classList.toggle('open');
  });
  const streamingEl = container.querySelector('.ai-msg.streaming .ai-msg-body');
  if (streamingEl) {
    streamingEl.appendChild(el);
  }
  currentThinkingEl = el;
}

function updateThinkingBlock(content: string): void {
  if (!currentThinkingEl) return;
  const body = currentThinkingEl.querySelector('.ai-thinking-body');
  if (body) body.textContent = content;
}

function finalizeThinkingBlock(container: HTMLElement | null, startTime: number, content: string): void {
  if (!currentThinkingEl) return;
  const duration = ((Date.now() - startTime) / 1000).toFixed(1);
  const header = currentThinkingEl.querySelector('.ai-thinking-header');
  if (header) {
    header.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"/>
      </svg>
      <span>思考完成</span>
      <span class="ai-thinking-duration">${duration}s</span>
    `;
  }
  const body = currentThinkingEl.querySelector('.ai-thinking-body');
  if (body) body.textContent = content;
  currentThinkingEl = null;
}

// ── Tool call indicator ──────────────────────────────────
function showToolCallIndicator(toolName: string, args: Record<string, unknown>): void {
  const messages = document.getElementById('aiMessages');
  if (!messages) return;

  const desc = getToolDescription(toolName, args);
  const el = document.createElement('div');
  el.className = 'tool-call-item';
  el.style.padding = '2px 0';
  el.style.marginLeft = '8px';
  el.textContent = desc;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
}

// ── Streaming with new runtime ──────────────────────────
async function sendStreamingMessage(text: string): Promise<void> {
  if (!text.trim()) return;

  // Parse @mentions
  const mentions = MentionParser.parse(text);
  const resolvedContext = await MentionParser.resolve(mentions);
  const contextStr = MentionParser.buildContextString(resolvedContext);
  const cleanedInput = MentionParser.stripMentions(text);
  const finalInput = contextStr ? cleanedInput + contextStr : cleanedInput;

  // Ensure session exists
  const session = sessionManager.getCurrentSession();
  if (!session) {
    showToast('请先创建会话');
    return;
  }

  // Add user message to UI
  const messages = document.getElementById('aiMessages');
  if (messages) {
    const userMsg = document.createElement('div');
    userMsg.className = 'ai-msg user';
    userMsg.innerHTML = `<div class="ai-msg-body">${formatReply(text)}</div>`;
    messages.appendChild(userMsg);

    const streamingMsg = document.createElement('div');
    streamingMsg.className = 'ai-msg ai streaming';
    streamingMsg.innerHTML = '<div class="ai-msg-body"><em class="streaming-cursor">思考中…</em></div>';
    messages.appendChild(streamingMsg);
    messages.scrollTop = messages.scrollHeight;
  }

  // Reset batch tracking
  toolBatchIndex = 0;
  newCardIds = [];
  isStreaming = true;
  setStreamingUI(true);

  let fullText = '';
  let thinkingStartTime = 0;
  let thinkingContent = '';
  let streamingToolCalls: string[] = [];
  let toolCallsContainer: HTMLElement | null = null;

  try {
    // Create runtime
    currentRuntime = RuntimeFactory.create('anthropic');

    // Stream response
    await currentRuntime.sendMessage(
      finalInput,
      getCanvasContext(),
      async (chunk: StreamChunk) => {
        if (chunk.type === 'text') {
          const cursor = messages?.querySelector('.streaming-cursor');
          if (cursor) cursor.remove();

          // Close thinking block if open
          if (thinkingStartTime > 0) {
            finalizeThinkingBlock(messages, thinkingStartTime, thinkingContent);
            thinkingStartTime = 0;
            thinkingContent = '';
          }

          fullText += chunk.content || '';
          appendToLastAiMessage(chunk.content || '');
        } else if (chunk.type === 'thinking') {
          // Start or continue thinking block
          if (thinkingStartTime === 0) {
            thinkingStartTime = Date.now();
            createThinkingBlock(messages);
          }
          thinkingContent += chunk.content || '';
          updateThinkingBlock(thinkingContent);
        } else if (chunk.type === 'tool_call') {
          if (chunk.tool_call) {
            // Close thinking block if open
            if (thinkingStartTime > 0) {
              finalizeThinkingBlock(messages, thinkingStartTime, thinkingContent);
              thinkingStartTime = 0;
              thinkingContent = '';
            }

            // Create collapsible group on first tool call
            if (!toolCallsContainer && messages) {
              toolCallsContainer = document.createElement('div');
              toolCallsContainer.className = 'tool-calls-summary';
              const listId = `tc-${Date.now()}`;
              toolCallsContainer.innerHTML = `
                <span class="tool-calls-toggle" onclick="this.classList.toggle('open');document.getElementById('${listId}').classList.toggle('open')">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
                  <span class="toggle-text">工具调用</span>
                </span>
                <div class="tool-calls-list" id="${listId}"></div>
              `;
              // Insert into the streaming AI message body
              const streamingEl = messages.querySelector('.ai-msg.streaming .ai-msg-body');
              if (streamingEl) {
                streamingEl.appendChild(toolCallsContainer);
              }
            }

            // Add tool call item
            const desc = getToolDescription(chunk.tool_call.name, chunk.tool_call.arguments);
            streamingToolCalls.push(desc);
            const list = toolCallsContainer?.querySelector('.tool-calls-list');
            if (list) {
              const item = document.createElement('div');
              item.className = 'tool-call-item';
              item.textContent = desc;
              list.appendChild(item);
            }
            // Update count in toggle
            const toggleText = toolCallsContainer?.querySelector('.toggle-text');
            if (toggleText) {
              toggleText.textContent = `${streamingToolCalls.length} 次工具调用`;
            }
            if (messages) messages.scrollTop = messages.scrollHeight;

            // Execute tool (async, with approval for write/destructive tools)
            await executeTool(chunk.tool_call.name, chunk.tool_call.arguments);
          }
        } else if (chunk.type === 'tool_result') {
          if (chunk.tool_result) {
            renderCanvas();
            renderConnections();
          }
        } else if (chunk.type === 'done') {
          // Close thinking block if still open
          if (thinkingStartTime > 0) {
            finalizeThinkingBlock(messages, thinkingStartTime, thinkingContent);
            thinkingStartTime = 0;
          }

          // Finalize
          const streamingEl = messages?.querySelector('.ai-msg.streaming');
          if (streamingEl) {
            streamingEl.classList.remove('streaming');
          }

          // Auto-layout if multiple cards created
          if (newCardIds.length > 1) {
            autoLayout(newCardIds, () => {
              isStreaming = false;
              setStreamingUI(false);
            });
          } else {
            if (newCardIds.length === 1) {
              renderCanvas();
              renderConnections();
            }
            isStreaming = false;
            setStreamingUI(false);
          }
        } else if (chunk.type === 'error') {
          appendToLastAiMessage(`\n\n[错误: ${chunk.error}]`);
          isStreaming = false;
          setStreamingUI(false);
        }
      }
    );
  } catch (error: any) {
    if (error.name === 'AbortError') {
      appendToLastAiMessage('\n\n⏸ 已暂停');
    } else {
      console.error('Streaming failed:', error);
      appendToLastAiMessage('\n\n抱歉，AI 暂时无法响应。请稍后再试。');
    }
    isStreaming = false;
    setStreamingUI(false);
  } finally {
    if (currentRuntime) {
      currentRuntime.cleanup();
      currentRuntime = null;
    }
  }

  // Clear input
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  if (input) input.value = '';
}

// ── UI Management ───────────────────────────────────────
function showChatView(): void {
  viewMode = 'chat';

  // Show chat header, hide list header
  const chatHeader = document.getElementById('aiChatHeader');
  const listHeader = document.getElementById('aiListHeader');
  if (chatHeader) chatHeader.style.display = 'flex';
  if (listHeader) listHeader.style.display = 'none';

  // Show chat messages, hide list
  const messages = document.getElementById('aiMessages');
  const convList = document.getElementById('aiConvList');
  if (messages) messages.style.display = 'block';
  if (convList) convList.style.display = 'none';

  // Show chat footer
  const footer = document.getElementById('aiChatFooter');
  if (footer) footer.style.display = 'block';

  renderChatHistory();
}

function showListView(): void {
  viewMode = 'list';

  // Show list header, hide chat header
  const chatHeader = document.getElementById('aiChatHeader');
  const listHeader = document.getElementById('aiListHeader');
  if (chatHeader) chatHeader.style.display = 'none';
  if (listHeader) listHeader.style.display = 'flex';

  // Show list, hide chat messages
  const messages = document.getElementById('aiMessages');
  const convList = document.getElementById('aiConvList');
  if (messages) messages.style.display = 'none';
  if (convList) convList.style.display = 'block';

  // Hide chat footer
  const footer = document.getElementById('aiChatFooter');
  if (footer) footer.style.display = 'none';

  renderSessionList();
}

// ── Event handlers ──────────────────────────────────────
export function openAiPanel(): void {
  const panel = document.getElementById('aiPanel');
  if (panel) {
    panel.classList.add('open');

    // Check if there's a current session
    const currentSession = sessionManager.getCurrentSession();
    if (currentSession) {
      // If there's a session, show chat view
      showChatView();
    } else {
      // Otherwise show session list
      showListView();
    }

    setTimeout(() => {
      const input = document.getElementById('aiInput') as HTMLTextAreaElement;
      if (input && viewMode === 'chat') input.focus();
    }, 100);
  }
}

export function closeAiPanel(): void {
  const panel = document.getElementById('aiPanel');
  if (panel) {
    panel.classList.remove('open');
  }
}

// ── Quick actions ───────────────────────────────────────
function prefillInput(text: string): void {
  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  if (input) {
    input.value = text;
    input.focus();
  }
  openAiPanel();
}

export function quickInquiry(): void {
  const selected = state.cards.filter(c => state.selectedCards.has(c.id));
  if (selected.length === 0) return;
  const query = `请分析这 ${selected.length} 张卡片的逻辑关系，找出其中的假设、漏洞和改进方向。\n${selected.map(c => `- #${c.id}: ${c.text}`).join('\n')}`;
  prefillInput(query);
}

export function quickDebate(): void {
  const selected = state.cards.filter(c => state.selectedCards.has(c.id));
  if (selected.length === 0) return;
  const query = `请对这 ${selected.length} 张卡片进行辩证分析：先概括核心论点，然后从反对角度提出有力反驳，最后给出综合见解。\n${selected.map(c => `- #${c.id}: ${c.text}`).join('\n')}`;
  prefillInput(query);
}

export function addQuestionCard(text: string): void {
  const selected = state.cards.filter(c => state.selectedCards.has(c.id));
  const avgX = selected.length > 0 ? selected.reduce((s, c) => s + c.x, 0) / selected.length : 400;
  const avgY = selected.length > 0 ? selected.reduce((s, c) => s + c.y, 0) / selected.length : 300;

  state.cards.push({
    id: state.nextId++,
    text,
    source: t('source-ai'),
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: 'pending' as const,
    inCanvas: true,
    x: Math.round(avgX + 280),
    y: Math.round(avgY + 40),
  });
  renderCanvas();
  scheduleSave();
  showToast(t('question-card-added'));
}

export function initAiPanel(): void {
  // Remove backdrop click listener - we don't want backdrop anymore
  // const backdrop = document.getElementById('aiBackdrop');
  // if (backdrop) {
  //   backdrop.addEventListener('click', closeAiPanel);
  // }

  const closeBtn = document.getElementById('aiCloseBtn');
  if (!closeBtn) {
    // Fallback to aiPanelClose if aiCloseBtn doesn't exist
    const fallbackClose = document.getElementById('aiPanelClose');
    if (fallbackClose) {
      fallbackClose.addEventListener('click', closeAiPanel);
    }
    const fallbackClose2 = document.getElementById('aiPanelClose2');
    if (fallbackClose2) {
      fallbackClose2.addEventListener('click', closeAiPanel);
    }
  } else {
    closeBtn.addEventListener('click', closeAiPanel);
  }

  const openBtn = document.getElementById('topbarAiBtn');
  if (openBtn) {
    openBtn.addEventListener('click', openAiPanel);
  }

  // New session button
  const newBtn = document.getElementById('aiNewBtn');
  if (newBtn) {
    newBtn.addEventListener('click', async () => {
      try {
        await sessionManager.createSession(
          state.currentSpaceId || 1,
          'anthropic',
          t('new-conversation')
        );
        showChatView();
        const messages = document.getElementById('aiMessages');
        if (messages) messages.innerHTML = '';
      } catch (error) {
        handleError(error, 'createSession');
      }
    });
  }

  // Back button: return to session list
  const backBtn = document.getElementById('aiBackBtn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      sessionManager.clearCurrentSession();
      showListView();
    });
  }

  const sendBtn = document.getElementById('aiSendBtn');
  if (sendBtn) {
    sendBtn.addEventListener('click', () => {
      const input = document.getElementById('aiInput') as HTMLTextAreaElement;
      if (input && input.value.trim()) {
        sendStreamingMessage(input.value);
      }
    });
  }

  const stopBtn = document.getElementById('aiStopBtn');
  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      if (currentRuntime) {
        currentRuntime.cleanup();
        currentRuntime = null;
      }
    });
  }

  const input = document.getElementById('aiInput') as HTMLTextAreaElement;
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim()) {
          sendStreamingMessage(input.value);
        }
      }
    });
  }

  // Initialize delete session modal listeners
  const deleteCancel = document.getElementById('deleteSessionCancel');
  if (deleteCancel) {
    deleteCancel.addEventListener('click', closeDeleteSessionModal);
  }

  const deleteConfirm = document.getElementById('deleteSessionConfirm');
  if (deleteConfirm) {
    deleteConfirm.addEventListener('click', confirmDeleteSession);
  }

  // YOLO mode toggle button
  const yoloBtn = document.getElementById('aiYoloBtn');
  if (yoloBtn) {
    yoloBtn.addEventListener('click', () => {
      yoloMode = !yoloMode;
      yoloBtn.classList.toggle('active', yoloMode);
      yoloBtn.textContent = yoloMode ? '🚀 YOLO' : '🔒 审批';
      showToast(
        yoloMode ? '🚀 YOLO 模式已启用：所有操作将自动批准' : '🔒 审批模式已启用：操作需要确认',
        yoloMode ? 'success' : 'info'
      );
    });
  }
}

// Export yoloMode for external access
export function isYoloMode(): boolean {
  return yoloMode;
}

export function setYoloMode(enabled: boolean): void {
  yoloMode = enabled;
  const yoloBtn = document.getElementById('aiYoloBtn');
  if (yoloBtn) {
    yoloBtn.classList.toggle('active', yoloMode);
    yoloBtn.textContent = yoloMode ? '🚀 YOLO' : '🔒 审批';
  }
}
