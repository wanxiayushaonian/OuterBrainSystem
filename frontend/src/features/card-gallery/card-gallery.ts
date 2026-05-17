// ═══════════════════════════════════════════════════════
// Card Gallery — Canvas-based showcase of all card types
// Enters a read-only gallery mode on the main canvas
// ═══════════════════════════════════════════════════════
import { state, cancelPendingSave } from '../../core/types/state';
import type { Card, Connection, CardGroup } from '../../core/types/types';
import { renderCanvas } from '../canvas/renderer';
import { applyTransform } from '../canvas/transform';

// Saved state when entering gallery mode
let savedCards: Card[] = [];
let savedConnections: Connection[] = [];
let savedGroups: CardGroup[] = [];
let savedPan = { x: 0, y: 0 };
let savedZoom = 1;

// ── Example cards for each type ──

function getExampleCards(): Card[] {
  const base = { source: 'Card Gallery', time: '10:30', status: '' as const, inCanvas: true };
  const colW = 300;
  const rowH = 400;
  let col = 0;
  let row = 0;
  function pos() {
    const x = 60 + col * colW;
    const y = 60 + row * rowH;
    col++;
    if (col >= 3) { col = 0; row++; }
    return { x, y };
  }

  return [
    // 1. Note
    { id: -1, ...base, ...pos(), text: '这是一条笔记示例，记录想法和信息。支持 **Markdown** 格式和 [[wikilinks]]。',
      type: 'note', title: '笔记标题', keywords: ['示例', '笔记'] },
    // 2. Progress
    { id: -2, ...base, ...pos(), text: '项目进度追踪', type: 'progress',
      metadata: { progress: { value: 65, label: '第二阶段进行中', color: 'oklch(55% 0.16 255)' } } },
    // 3. Checklist
    { id: -3, ...base, ...pos(), text: '待办事项清单', type: 'checklist',
      metadata: { checklist: [
        { text: '已完成的任务', done: true },
        { text: '进行中的任务', done: false },
        { text: '待开始的任务', done: false },
      ]} },
    // 4. Quote
    { id: -4, ...base, ...pos(), text: '引用名言', type: 'quote',
      metadata: { quote: { text: '学而不思则罔，思而不学则殆', author: '孔子', source: '论语' } } },
    // 5. Distillation
    { id: -5, ...base, ...pos(), text: '内容提炼结果', type: 'distillation',
      metadata: {
        original_text: '这是一段需要提炼的原始文本内容，包含多个关键信息点。',
        extracted_keywords: ['关键词1', '关键词2', '关键词3'],
        recommended_keywords: ['推荐词1'],
        user_selected_keywords: ['关键词1'],
        reasoning: '基于内容相关性提取',
      } },
    // 6. Socratic
    { id: -6, ...base, ...pos(), text: '苏格拉底式追问', type: 'socratic',
      metadata: {
        original_claim: 'AI 将取代所有程序员',
        challenges: [
          { question: '这个假设的前提是什么？', response: '假设 AI 能理解所有业务需求' },
          { question: '有没有反例？', response: '创意设计和架构决策仍需人类判断' },
        ],
        reasoning: '通过层层追问检验论点的可靠性',
      } },
    // 7. Flow Analysis
    { id: -7, ...base, ...pos(), text: '用户注册流程', type: 'flow_analysis',
      metadata: {
        flow_type: 'process',
        stages: [
          { name: '填写信息', description: '用户填写邮箱和密码', insights: ['减少必填项'], issues: [] },
          { name: '邮箱验证', description: '发送验证邮件', insights: [], issues: ['验证邮件延迟'] },
          { name: '完成注册', description: '创建账户并跳转', insights: ['引导完善资料'], issues: [] },
        ],
      } },
    // 8. Choice
    { id: -8, ...base, ...pos(), text: '技术选型决策', type: 'choice',
      metadata: {
        context: '团队需要选择前端框架',
        options: [
          { name: 'React', description: 'Facebook 开发的 UI 库', pros: ['生态成熟', '社区活跃'], cons: ['学习曲线陡'] },
          { name: 'Vue', description: '渐进式前端框架', pros: ['易上手', '文档清晰'], cons: ['大型项目经验少'] },
        ],
        recommendation: 'React',
        reasoning: '团队已有 React 经验',
      } },
    // 9. Vote
    { id: -9, ...base, ...pos(), text: '方案投票', type: 'vote',
      metadata: {
        question: '选择哪个前端框架？',
        options: [
          { id: 'a', text: 'React', votes: 5 },
          { id: 'b', text: 'Vue', votes: 3 },
          { id: 'c', text: 'Svelte', votes: 2 },
        ],
        allow_multiple: false,
        user_votes: ['a'],
      } },
    // 10. Debate
    { id: -10, ...base, ...pos(), text: '技术选型辩论：微服务 vs 单体架构', type: 'debate',
      metadata: {
        debate: {
          topic: '微服务 vs 单体架构',
          positions: [
            { title: '正方：微服务', supporting_evidence: '独立部署、技术栈灵活', challenges: '分布式复杂度高' },
            { title: '反方：单体架构', supporting_evidence: '开发简单、调试方便', challenges: '扩展性差' },
          ],
          synthesis: '根据团队规模和业务复杂度选择合适的架构',
        },
      } },
    // 11. Research Path
    { id: -11, ...base, ...pos(), text: '研究路径规划', type: 'research_path',
      metadata: { research_path: {
        title: '研究主题',
        steps: [
          { title: '文献调研', description: '收集相关论文', status: 'completed' },
          { title: '方案设计', description: '设计实验方案', status: 'in_progress' },
          { title: '实验验证', description: '执行并验证', status: 'pending' },
        ],
        current_step: 1,
      } } },
    // 12. Image
    { id: -12, ...base, ...pos(), text: '图片卡片', type: 'image',
      metadata: { imageName: '示例图片', imageData: '' } },
    // 13. Conclusion
    { id: -13, ...base, ...pos(), text: '最终结论', status: 'conclusion', type: 'conclusion',
      summary: '经过多方讨论后得出的结论摘要', chainIds: [] },
  ];
}

// ── Enter / Exit gallery mode ──

export function enterGallery(): void {
  if (state.galleryMode) return;

  // Cancel any pending auto-save to prevent gallery cards from being saved
  cancelPendingSave();

  // Save current state
  savedCards = [...state.cards];
  savedConnections = [...state.connections];
  savedGroups = [...state.groups];
  savedPan = { ...state.pan };
  savedZoom = state.zoom;

  // Switch to gallery
  state.galleryMode = true;
  state.cards = getExampleCards();
  state.connections = [];
  state.groups = [];
  state.selectedCards.clear();
  state.highlightRootId = null;
  state.searchResultIds = null;
  state.pan = { x: 40, y: 40 };
  state.zoom = 0.9;

  renderGallery();
}

export function exitGallery(): void {
  if (!state.galleryMode) return;

  // Restore saved state
  state.galleryMode = false;
  state.cards = savedCards;
  state.connections = savedConnections;
  state.groups = savedGroups;
  state.pan = savedPan;
  state.zoom = savedZoom;
  state.selectedCards.clear();
  state.highlightRootId = null;
  state.searchResultIds = null;

  renderGallery();
}

function renderGallery(): void {
  renderGalleryBanner();
  renderCanvas();
  applyTransform();
}

// ── Gallery banner (fixed overlay at top of canvas area) ──

let bannerEl: HTMLElement | null = null;

function renderGalleryBanner(): void {
  const canvasArea = document.getElementById('canvasArea');
  if (!canvasArea) return;

  if (!state.galleryMode) {
    // Remove banner
    if (bannerEl) {
      bannerEl.remove();
      bannerEl = null;
    }
    return;
  }

  if (!bannerEl) {
    bannerEl = document.createElement('div');
    bannerEl.className = 'gallery-banner';
    bannerEl.innerHTML = `
      <button class="gallery-banner-back" id="galleryBackBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        <span data-i18n="gallery-back">返回画布 Back</span>
      </button>
      <span class="gallery-banner-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        <span data-i18n="gallery-title">卡片类型库 Card Types</span>
      </span>
      <span class="gallery-banner-hint" data-i18n="gallery-hint">只读预览 — 查看所有卡片类型样式</span>
    `;
    canvasArea.appendChild(bannerEl);

    document.getElementById('galleryBackBtn')?.addEventListener('click', exitGallery);
  }
}

// ── Public API ──

export function isGalleryMode(): boolean {
  return state.galleryMode;
}

export function initCardGallery(): void {
  // Nothing to init, gallery is activated on demand
}
