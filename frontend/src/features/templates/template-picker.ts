// ═══════════════════════════════════════════════════════
// Template Picker — Built-in + custom canvas templates
// ═══════════════════════════════════════════════════════
import { TEMPLATES, applyTemplate } from './templates';
import type { CanvasTemplate } from './templates';
import { screenToCanvas, fitCanvas } from '../canvas/transform';
import { state } from '../../core/types/state';

const STORAGE_KEY = 'nexus-custom-templates';
let popup: HTMLElement | null = null;

// ── Custom template storage ──

function loadCustomTemplates(): CanvasTemplate[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveCustomTemplates(templates: CanvasTemplate[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

function deleteCustomTemplate(id: string): void {
  const templates = loadCustomTemplates().filter(t => t.id !== id);
  saveCustomTemplates(templates);
}

let saveModal: HTMLElement | null = null;
let confirmModal: HTMLElement | null = null;

function showConfirm(message: string): Promise<boolean> {
  if (!confirmModal) {
    confirmModal = document.createElement('div');
    confirmModal.className = 'template-confirm-modal';
    confirmModal.innerHTML = `
      <div class="template-confirm-backdrop"></div>
      <div class="template-confirm-dialog">
        <div class="template-confirm-body"></div>
        <div class="template-confirm-footer">
          <button class="template-confirm-cancel">取消</button>
          <button class="template-confirm-ok">删除</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmModal);
  }

  const body = confirmModal.querySelector('.template-confirm-body')!;
  body.textContent = message;

  return new Promise(resolve => {
    const close = (result: boolean) => {
      confirmModal!.classList.remove('open');
      resolve(result);
    };

    const backdrop = confirmModal!.querySelector('.template-confirm-backdrop')!;
    const cancelBtn = confirmModal!.querySelector('.template-confirm-cancel')!;
    const okBtn = confirmModal!.querySelector('.template-confirm-ok')!;

    const onBackdrop = () => close(false);
    const onCancel = () => close(false);
    const onOk = () => close(true);

    backdrop.replaceWith(backdrop.cloneNode(true));
    cancelBtn.replaceWith(cancelBtn.cloneNode(true));
    okBtn.replaceWith(okBtn.cloneNode(true));

    confirmModal!.querySelector('.template-confirm-backdrop')!.addEventListener('click', onBackdrop);
    confirmModal!.querySelector('.template-confirm-cancel')!.addEventListener('click', onCancel);
    confirmModal!.querySelector('.template-confirm-ok')!.addEventListener('click', onOk);

    confirmModal!.classList.add('open');
  });
}

function ensureSaveModal(): HTMLElement {
  if (saveModal) return saveModal;

  saveModal = document.createElement('div');
  saveModal.className = 'template-save-modal';
  saveModal.innerHTML = `
    <div class="template-save-modal-backdrop"></div>
    <div class="template-save-modal-dialog">
      <div class="template-save-modal-header">
        <span class="template-save-modal-title">保存为模板</span>
        <button class="template-save-modal-close">&times;</button>
      </div>
      <div class="template-save-modal-body">
        <label class="template-save-label">
          <span>模板名称</span>
          <input type="text" class="template-save-input" id="saveTemplateName" placeholder="例如：我的 SWOT 分析" maxlength="30" />
        </label>
        <label class="template-save-label">
          <span>模板描述</span>
          <input type="text" class="template-save-input" id="saveTemplateDesc" placeholder="简要描述模板用途" maxlength="60" />
        </label>
      </div>
      <div class="template-save-modal-footer">
        <button class="template-save-cancel" id="saveTemplateCancel">取消</button>
        <button class="template-save-confirm" id="saveTemplateConfirm">保存</button>
      </div>
    </div>
  `;

  document.body.appendChild(saveModal);

  const close = () => { saveModal?.classList.remove('open'); };
  saveModal.querySelector('.template-save-modal-backdrop')?.addEventListener('click', close);
  saveModal.querySelector('.template-save-modal-close')?.addEventListener('click', close);
  saveModal.querySelector('#saveTemplateCancel')?.addEventListener('click', close);

  return saveModal;
}

/** Open save-template modal and perform save on confirm. */
export function saveCurrentCanvasAsTemplate(): void {
  const selectedIds = state.selectedCards;
  if (selectedIds.size < 2) {
    alert('请先在画布上框选至少 2 张卡片，再保存为模板。');
    return;
  }

  const selectedCards = state.cards.filter(c => selectedIds.has(c.id));
  if (selectedCards.length === 0) {
    alert('请先在画布上框选卡片，再保存为模板。');
    return;
  }

  const modal = ensureSaveModal();
  const nameInput = modal.querySelector('#saveTemplateName') as HTMLInputElement;
  const descInput = modal.querySelector('#saveTemplateDesc') as HTMLInputElement;
  const confirmBtn = modal.querySelector('#saveTemplateConfirm')!;

  // Pre-fill name with timestamp
  nameInput.value = `我的模板 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`;
  descInput.value = `${selectedCards.length} 张卡片 · ${state.connections.filter(c => selectedIds.has(c.from) && selectedIds.has(c.to)).length} 条连接`;

  // Remove old listener, add fresh one
  const newConfirm = confirmBtn.cloneNode(true) as HTMLElement;
  confirmBtn.replaceWith(newConfirm);

  newConfirm.addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) {
      nameInput.focus();
      return;
    }
    const description = descInput.value.trim() || `${selectedCards.length} 张卡片`;

    // Calculate center of selected cards
    const centerX = selectedCards.reduce((s, c) => s + c.x, 0) / selectedCards.length;
    const centerY = selectedCards.reduce((s, c) => s + c.y, 0) / selectedCards.length;

    // Build template cards with relative offsets
    const idMap = new Map<number, number>();
    const templateCards = selectedCards.map((c, i) => {
      idMap.set(c.id, i);
      return {
        text: c.text,
        type: c.type,
        dx: Math.round(c.x - centerX),
        dy: Math.round(c.y - centerY),
      };
    });

    // Build template connections
    const templateConnections = state.connections
      .filter(c => idMap.has(c.from) && idMap.has(c.to))
      .map(c => ({
        from: idMap.get(c.from)!,
        to: idMap.get(c.to)!,
        label: c.label,
      }));

    const template: CanvasTemplate = {
      id: `custom-${Date.now()}`,
      name,
      icon: '⭐',
      description,
      cards: templateCards,
      connections: templateConnections,
    };

    const customs = loadCustomTemplates();
    customs.push(template);
    saveCustomTemplates(customs);

    modal.classList.remove('open');
    rebuildGrid();
  });

  // Enter key in inputs triggers confirm
  const handleEnter = (e: KeyboardEvent) => {
    if (e.key === 'Enter') newConfirm.click();
  };
  nameInput.addEventListener('keydown', handleEnter);
  descInput.addEventListener('keydown', handleEnter);

  modal.classList.add('open');
  nameInput.focus();
  nameInput.select();
}

// ── UI ──

function ensurePopup(): HTMLElement {
  if (popup) return popup;

  popup = document.createElement('div');
  popup.className = 'template-picker';
  popup.innerHTML = `
    <div class="template-picker-backdrop"></div>
    <div class="template-picker-dialog">
      <div class="template-picker-header">
        <span class="template-picker-title">选择思维模板</span>
        <button class="template-picker-close">&times;</button>
      </div>
      <div class="template-picker-body">
        <div class="template-section-title">内置模板</div>
        <div class="template-picker-grid" id="builtinGrid"></div>
        <div class="template-section-title" id="customSectionTitle" style="display:none">自建模板</div>
        <div class="template-picker-grid" id="customGrid"></div>
      </div>
    </div>
  `;

  document.body.appendChild(popup);

  popup.querySelector('.template-picker-backdrop')?.addEventListener('click', closeTemplatePicker);
  popup.querySelector('.template-picker-close')?.addEventListener('click', closeTemplatePicker);

  // Build built-in templates
  const builtinGrid = popup.querySelector('#builtinGrid')!;
  for (const tpl of TEMPLATES) {
    builtinGrid.appendChild(createTemplateCard(tpl, false));
  }

  // Build custom templates
  rebuildGrid();

  return popup;
}

function rebuildGrid(): void {
  const customGrid = popup?.querySelector('#customGrid');
  const customTitle = popup?.querySelector('#customSectionTitle');
  if (!customGrid || !customTitle) return;

  customGrid.innerHTML = '';
  const customs = loadCustomTemplates();

  if (customs.length === 0) {
    customTitle.setAttribute('style', 'display:none');
    return;
  }

  customTitle.removeAttribute('style');
  for (const tpl of customs) {
    customGrid.appendChild(createTemplateCard(tpl, true));
  }
}

function createTemplateCard(tpl: CanvasTemplate, deletable: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = 'template-card';
  card.innerHTML = `
    <div class="template-card-icon">${tpl.icon}</div>
    <div class="template-card-name">${tpl.name}</div>
    <div class="template-card-desc">${tpl.description}</div>
    <div class="template-card-footer">
      <span class="template-card-meta">${tpl.cards.length} 张卡片 · ${tpl.connections.length} 条连接</span>
      ${deletable ? '<button class="template-card-delete" title="删除">&times;</button>' : ''}
    </div>
  `;

  card.addEventListener('click', (e) => {
    // Don't trigger apply when clicking delete
    if ((e.target as HTMLElement).closest('.template-card-delete')) return;
    applyTemplateAtCenter(tpl);
    closeTemplatePicker();
  });

  const deleteBtn = card.querySelector('.template-card-delete');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showConfirm(`删除模板「${tpl.name}」？`).then(ok => {
        if (ok) {
          deleteCustomTemplate(tpl.id);
          rebuildGrid();
        }
      });
    });
  }

  return card;
}

function applyTemplateAtCenter(tpl: CanvasTemplate): void {
  const area = document.getElementById('canvasArea');
  if (!area) return;

  const rect = area.getBoundingClientRect();
  const screenX = rect.left + rect.width / 2;
  const screenY = rect.top + rect.height / 2;
  const { x, y } = screenToCanvas(screenX, screenY);

  applyTemplate(tpl, x, y);
  fitCanvas();
}

/** Open the template picker. */
export function openTemplatePicker(): void {
  const el = ensurePopup();
  rebuildGrid(); // refresh custom templates
  el.classList.add('open');
}

/** Close the template picker. */
export function closeTemplatePicker(): void {
  popup?.classList.remove('open');
}
