// ═══════════════════════════════════════════════════════
// Per-card AI chat popup — now with real LLM
// ═══════════════════════════════════════════════════════
import { state, scheduleSave } from '../../core/types/state';
import { t } from '../../i18n';
import { renderCanvas, renderConnections } from '../canvas/renderer';
import { showToast } from '../../shared/components/toast';
import { aiInquiry } from './api';
import type { Card, Connection } from '../../core/types/types';

let cardAiTargetId: number | null = null;
let cardAiDragState: { startX: number; startY: number; startLeft: number; startTop: number } | null = null;

export function openCardAiPopup(cardId: number): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  cardAiTargetId = cardId;
  const popup = document.getElementById('cardAiPopup')!;
  const body = document.getElementById('cardAiBody')!;
  const title = document.getElementById('cardAiTitle')!;
  const input = document.getElementById('cardAiInput') as HTMLInputElement;

  const shortText = card.text.length > 30 ? card.text.substring(0, 30) + '…' : card.text;
  title.textContent = shortText;

  // Position popup near card
  const canvasArea = document.getElementById('canvasArea')!;
  const rect = canvasArea.getBoundingClientRect();
  let popupX = rect.left + card.x * state.zoom + state.pan.x + 260 * state.zoom + 12;
  let popupY = rect.top + card.y * state.zoom + state.pan.y;
  if (popupX + 340 > window.innerWidth) popupX = rect.left + card.x * state.zoom + state.pan.x - 352;
  popupX = Math.max(8, Math.min(popupX, window.innerWidth - 348));
  popupY = Math.max(8, Math.min(popupY, window.innerHeight - 448));
  popup.style.left = popupX + 'px';
  popup.style.top = popupY + 'px';

  // Build context
  const cardConnections = state.connections.filter(c => c.from === cardId || c.to === cardId);
  const connectedCards = cardConnections.map(c => {
    const otherId = c.from === cardId ? c.to : c.from;
    const other = state.cards.find(cc => cc.id === otherId);
    return other ? `"${other.text.substring(0, 25)}…"（${c.label}）` : '';
  }).filter(Boolean);

  let contextHtml = `<div class="card-ai-msg system">${t('card-ai-context')}: "${shortText}"</div>`;
  if (connectedCards.length > 0) {
    contextHtml += `<div class="card-ai-msg system">${t('card-ai-connections')}: ${connectedCards.join('、')}</div>`;
  }
  contextHtml += `<div class="card-ai-msg ai" id="cardAiLoading"><em>Analyzing card...</em></div>`;

  body.innerHTML = contextHtml;
  popup.classList.add('show');
  setTimeout(() => input?.focus(), 100);

  // Call real API
  callCardInquiry(card, cardConnections, body);
}

async function callCardInquiry(card: Card, connections: Connection[], bodyEl: HTMLElement): Promise<void> {
  try {
    const result = await aiInquiry([card]);
    const loadingEl = document.getElementById('cardAiLoading');
    if (!loadingEl) return;

    let html = `<strong>${t('card-ai-thinking')}</strong><br/><br/>`;
    html += result.analysis;
    if (result.challenges.length > 0) {
      html += `<br/><br/>${result.challenges.map(c => `• ${c}`).join('<br/>')}`;
    }
    if (result.suggested_cards.length > 0) {
      html += `<br/><span class="card-ai-action" data-action="card-ai-q" data-card-id="${card.id}" data-text="${escapeAttr(result.suggested_cards[0])}">+ ${t('card-ai-to-card')}</span>`;
    }
    loadingEl.innerHTML = html;
    loadingEl.id = '';
  } catch (err) {
    // Fallback to local analysis
    const loadingEl = document.getElementById('cardAiLoading');
    if (!loadingEl) return;
    const fallback = generateFallbackResponse(card, connections);
    let html = `<strong>${t('card-ai-thinking')}</strong><br/><br/>${fallback.text}`;
    if (fallback.action) {
      html += `<br/><span class="card-ai-action" data-action="card-ai-q" data-card-id="${card.id}" data-text="${escapeAttr(fallback.action.text)}">+ ${t('card-ai-to-card')}</span>`;
    }
    loadingEl.innerHTML = html;
    loadingEl.id = '';
  }
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function generateFallbackResponse(card: Card, connections: Connection[]): { text: string; action: { text: string } | null } {
  const hasSupports = connections.some(c => c.label.includes('支撑') || c.label.includes('Supports'));
  const hasQuestions = connections.some(c => c.label.includes('质疑') || c.label.includes('Questions'));
  const hasLeads = connections.some(c => c.label.includes('导致') || c.label.includes('Leads'));

  if (connections.length === 0) {
    return { text: `这张卡片是一个孤立的思维节点。它还没有与其他想法建立联系。<br/><br/><strong>建议：</strong>思考这个观点的前提是什么？它能支撑或质疑哪些其他想法？`, action: { text: '这个观点的前提是什么？' } };
  }
  if (hasSupports && !hasQuestions) {
    return { text: `这张卡片获得了支撑，但没有受到质疑。被支撑但不被质疑的想法往往是最危险的。`, action: { text: '如果这个观点是错的，会有什么后果？' } };
  }
  if (hasQuestions) {
    return { text: `这张卡片被质疑了——这是好事。`, action: { text: '我能用什么证据回应这个质疑？' } };
  }
  return { text: `这张卡片处于一个复杂的关系网络中。`, action: { text: '如果移除这张卡片，其他想法还能成立吗？' } };
}

export function closeCardAiPopup(): void {
  document.getElementById('cardAiPopup')!.classList.remove('show');
  cardAiTargetId = null;
}

function addCardAiQuestion(cardId: number, questionText: string): void {
  const card = state.cards.find(c => c.id === cardId);
  if (!card) return;

  const newCard = {
    id: state.nextId++,
    text: questionText,
    source: t('source-ai'),
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: 'pending' as const,
    inCanvas: true,
    x: card.x + 280,
    y: card.y + Math.round(Math.random() * 80 - 40),
  };
  state.cards.push(newCard);
  state.connections.push({ from: cardId, to: newCard.id, label: t('label-related') });
  renderCanvas();
  renderConnections();
  scheduleSave();
  showToast(t('toast-card-added'));
  openCardAiPopup(cardId);
}

export function sendCardAiMessage(): void {
  const input = document.getElementById('cardAiInput') as HTMLInputElement;
  const text = input?.value.trim();
  if (!text || !cardAiTargetId) return;

  const body = document.getElementById('cardAiBody')!;
  body.innerHTML += `<div class="card-ai-msg user">${text}</div>`;
  input.value = '';
  body.scrollTop = body.scrollHeight;

  // Show loading
  body.innerHTML += `<div class="card-ai-msg ai" id="cardAiFollowUp"><em>Thinking...</em></div>`;
  body.scrollTop = body.scrollHeight;

  // Call API
  const card = state.cards.find(c => c.id === cardAiTargetId);
  if (!card) return;
  callCardFollowUp(card, text, body);
}

async function callCardFollowUp(card: Card, question: string, bodyEl: HTMLElement): Promise<void> {
  try {
    const result = await aiInquiry([card], question);
    const loadingEl = document.getElementById('cardAiFollowUp');
    if (!loadingEl) return;
    loadingEl.innerHTML = result.analysis;
    loadingEl.id = '';
  } catch (err) {
    const loadingEl = document.getElementById('cardAiFollowUp');
    if (!loadingEl) return;
    loadingEl.innerHTML = `基于你的追问，我重新审视了这张卡片：核心问题是这个观点的<strong>可证伪性</strong>如何。`;
    loadingEl.id = '';
  }
  bodyEl.scrollTop = bodyEl.scrollHeight;
}

export function initCardAiPopup(): void {
  const closeBtn = document.getElementById('cardAiClose');
  const sendBtn = document.getElementById('cardAiSend');
  const input = document.getElementById('cardAiInput') as HTMLInputElement;
  const body = document.getElementById('cardAiBody');
  const header = document.getElementById('cardAiHeader');

  closeBtn?.addEventListener('click', closeCardAiPopup);
  sendBtn?.addEventListener('click', sendCardAiMessage);
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') sendCardAiMessage(); });

  body?.addEventListener('click', (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action === 'card-ai-q' && target.dataset.cardId && target.dataset.text) {
      addCardAiQuestion(parseInt(target.dataset.cardId), target.dataset.text);
    }
  });

  header?.addEventListener('mousedown', (e: MouseEvent) => {
    if ((e.target as HTMLElement).closest('.card-ai-popup-close')) return;
    e.preventDefault();
    const popup = document.getElementById('cardAiPopup')!;
    cardAiDragState = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: parseInt(popup.style.left) || 0,
      startTop: parseInt(popup.style.top) || 0,
    };
  });

  document.addEventListener('mousemove', (e: MouseEvent) => {
    if (!cardAiDragState) return;
    const popup = document.getElementById('cardAiPopup')!;
    popup.style.left = (cardAiDragState.startLeft + e.clientX - cardAiDragState.startX) + 'px';
    popup.style.top = (cardAiDragState.startTop + e.clientY - cardAiDragState.startY) + 'px';
  });

  document.addEventListener('mouseup', () => { cardAiDragState = null; });
}
