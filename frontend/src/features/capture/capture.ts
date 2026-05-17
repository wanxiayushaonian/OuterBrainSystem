// ═══════════════════════════════════════════════════════
// Quick capture popup — with card type selection
// ═══════════════════════════════════════════════════════
import { state, pushUndo, scheduleSave } from '../../core/types/state';
import { t } from '../../i18n';
import { renderInbox } from '../inbox/inbox';
import { showToast } from '../../shared/components/toast';
import { compressTitle } from '../chat/api';
import { showKeywordWall } from '../../shared/components/gravity-wall';
import type { Card } from '../../core/types/types';

type CardType = Card['type'];
type CaptureType = CardType | 'question' | '';

let pendingText = '';
let pendingTitle = '';
let selectedType: CaptureType = '';

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

  // Reset type selection
  selectedType = '' as CaptureType;
  updateTypeButtons();
  updateMetadataFields();
}

export function closeCapture(): void {
  document.getElementById('capturePopup')!.classList.remove('open');
  document.getElementById('backdrop')!.classList.remove('open');
  const input = document.getElementById('captureInput') as HTMLTextAreaElement;
  if (input) input.value = '';
  pendingText = '';
  pendingTitle = '';
  selectedType = '' as CaptureType;
}

export function submitCapture(): void {
  const input = document.getElementById('captureInput') as HTMLTextAreaElement;
  const text = input?.value.trim();
  if (!text) return;

  pendingText = text;

  // For simple types (note, question), skip title compression
  if (selectedType === 'progress' || selectedType === 'checklist' || selectedType === 'quote') {
    finalizeCapture([]);
    return;
  }

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

function getCardMetadata(): Record<string, any> | undefined {
  if (selectedType === 'progress') {
    const valueInput = document.getElementById('metaProgressValue') as HTMLInputElement;
    const labelInput = document.getElementById('metaProgressLabel') as HTMLInputElement;
    const value = parseInt(valueInput?.value || '0', 10);
    return {
      progress: {
        value: isNaN(value) ? 0 : Math.max(0, Math.min(100, value)),
        label: labelInput?.value.trim() || undefined,
      }
    };
  }

  if (selectedType === 'checklist') {
    const itemsInput = document.getElementById('metaChecklistItems') as HTMLTextAreaElement;
    const lines = (itemsInput?.value || '').split('\n').filter(l => l.trim());
    if (lines.length === 0) return undefined;
    return {
      checklist: lines.map(line => ({
        text: line.trim(),
        done: false,
      }))
    };
  }

  if (selectedType === 'quote') {
    const authorInput = document.getElementById('metaQuoteAuthor') as HTMLInputElement;
    const sourceInput = document.getElementById('metaQuoteSource') as HTMLInputElement;
    return {
      quote: {
        text: pendingText,
        author: authorInput?.value.trim() || undefined,
        source: sourceInput?.value.trim() || undefined,
      }
    };
  }

  return undefined;
}

function finalizeCapture(keywords: string[]): void {
  pushUndo();
  const now = new Date();
  const metadata = getCardMetadata();

  const card: any = {
    id: state.nextId++,
    text: selectedType === 'quote' ? (metadata?.quote?.author ? `${pendingText} — ${metadata.quote.author}` : pendingText) : pendingText,
    source: t('source-nexus'),
    time: now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: '' as const,
    inCanvas: false,
    x: 0,
    y: 0,
    title: pendingTitle || undefined,
    keywords: keywords.length > 0 ? keywords : undefined,
  };

  // Add type if selected
  if (selectedType) {
    card.type = selectedType;
  }

  // Add metadata if present
  if (metadata) {
    card.metadata = metadata;
  }

  // For question type, set openQuestion
  if (selectedType === 'question') {
    card.type = 'note';
    card.openQuestion = pendingText;
  }

  state.cards.push(card);
  renderInbox();
  closeCapture();
  scheduleSave();
  showToast(t('toast-captured'));
}

function updateTypeButtons(): void {
  const buttons = document.querySelectorAll('.capture-type-btn');
  buttons.forEach(btn => {
    const type = (btn as HTMLElement).dataset.type || '';
    btn.classList.toggle('active', type === selectedType);
  });
}

function updateMetadataFields(): void {
  const container = document.getElementById('captureMetadata');
  if (!container) return;

  if (!selectedType) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'block';

  if (selectedType === 'progress') {
    container.innerHTML = `
      <label>
        进度值 (0-100)
        <input type="number" id="metaProgressValue" min="0" max="100" value="0" placeholder="0" />
      </label>
      <label>
        进度说明 (可选)
        <input type="text" id="metaProgressLabel" placeholder="例如：第一阶段完成" />
      </label>
    `;
  } else if (selectedType === 'checklist') {
    container.innerHTML = `
      <label>
        清单项目 (每行一项)
        <textarea id="metaChecklistItems" class="checklist-items-input" placeholder="第一步&#10;第二步&#10;第三步"></textarea>
      </label>
    `;
  } else if (selectedType === 'quote') {
    container.innerHTML = `
      <label>
        引用来源
        <input type="text" id="metaQuoteAuthor" placeholder="作者名" />
      </label>
      <label>
        出处 (可选)
        <input type="text" id="metaQuoteSource" placeholder="书名、文章等" />
      </label>
    `;
  } else {
    container.style.display = 'none';
    container.innerHTML = '';
  }
}

export function initCapture(): void {
  const submitBtn = document.getElementById('captureSubmit');
  const closeBtn = document.getElementById('captureClose');
  const backdrop = document.getElementById('backdrop');

  submitBtn?.addEventListener('click', submitCapture);
  closeBtn?.addEventListener('click', closeCapture);
  backdrop?.addEventListener('click', closeCapture);

  // Type selector
  const typeSelector = document.getElementById('captureTypeSelector');
  typeSelector?.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.capture-type-btn') as HTMLElement;
    if (!btn) return;
    selectedType = (btn.dataset.type || '') as CaptureType;
    updateTypeButtons();
    updateMetadataFields();
  });

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
