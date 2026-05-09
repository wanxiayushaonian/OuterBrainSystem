// ═══════════════════════════════════════════════════════
// Quick capture popup — with title compression + keywords
// ═══════════════════════════════════════════════════════
import { state, pushUndo, scheduleSave } from '../../core/types/state';
import { t } from '../../i18n';
import { renderInbox } from '../inbox/inbox';
import { showToast } from '../../shared/components/toast';
import { compressTitle } from '../chat/api';
import { showKeywordWall } from '../../shared/components/gravity-wall';

let pendingText = '';
let pendingTitle = '';

export function openCapture(): void {
  document.getElementById('capturePopup')!.classList.add('open');
  document.getElementById('backdrop')!.classList.add('open');
  setTimeout(() => (document.getElementById('captureInput') as HTMLTextAreaElement)?.focus(), 100);

  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const sourceEl = document.getElementById('captureSource');
  if (sourceEl) sourceEl.textContent = t('source-capture', { time });

  // Hide title preview
  const preview = document.getElementById('captureTitlePreview');
  if (preview) preview.classList.remove('show');
}

export function closeCapture(): void {
  document.getElementById('capturePopup')!.classList.remove('open');
  document.getElementById('backdrop')!.classList.remove('open');
  const input = document.getElementById('captureInput') as HTMLTextAreaElement;
  if (input) input.value = '';
  pendingText = '';
  pendingTitle = '';
}

export function submitCapture(): void {
  const input = document.getElementById('captureInput') as HTMLTextAreaElement;
  const text = input?.value.trim();
  if (!text) return;

  pendingText = text;

  // Show loading on submit button
  const submitBtn = document.getElementById('captureSubmit') as HTMLButtonElement;
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Compressing...';
  }

  // Call title compression API
  callTitleCompression(text, submitBtn);
}

async function callTitleCompression(text: string, submitBtn: HTMLButtonElement | null): Promise<void> {
  try {
    const result = await compressTitle(text);
    pendingTitle = result.title;

    // Show title preview
    const preview = document.getElementById('captureTitlePreview');
    if (preview) {
      preview.innerHTML = `<strong>Title:</strong> ${escapeHtml(result.title)}`;
      preview.classList.add('show');
    }

    // Proceed with keyword extraction
    await showKeywordWall(text, (keywords) => {
      finalizeCapture(keywords);
    });
  } catch (err) {
    console.error('Title compression failed:', err);
    pendingTitle = text.substring(0, 10);
    finalizeCapture([]);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = t('capture-submit');
    }
  }
}

function finalizeCapture(keywords: string[]): void {
  pushUndo();
  const now = new Date();
  const card = {
    id: state.nextId++,
    text: pendingText,
    source: t('source-nexus'),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: '' as const,
    inCanvas: false,
    x: 0,
    y: 0,
    title: pendingTitle || undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
  };
  state.cards.push(card);
  renderInbox();
  closeCapture();
  scheduleSave();
  showToast(t('toast-captured'));
}

export function initCapture(): void {
  const submitBtn = document.getElementById('captureSubmit');
  const closeBtn = document.getElementById('captureClose');
  const backdrop = document.getElementById('backdrop');

  submitBtn?.addEventListener('click', submitCapture);
  closeBtn?.addEventListener('click', closeCapture);
  backdrop?.addEventListener('click', closeCapture);

  // Add title preview element
  const captureBody = document.querySelector('.capture-body');
  if (captureBody && !document.getElementById('captureTitlePreview')) {
    const preview = document.createElement('div');
    preview.id = 'captureTitlePreview';
    preview.className = 'capture-title-preview';
    captureBody.appendChild(preview);
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
