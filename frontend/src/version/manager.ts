// ═══════════════════════════════════════════════════════
// Version management: save, restore, branch, timeline
// ═══════════════════════════════════════════════════════
import { state, scheduleSave } from '../core/types/state';
import { t } from '../i18n';
import { renderCanvas, renderConnections } from '../features/canvas/renderer';
import { renderInbox } from '../features/inbox/inbox';
import { showToast } from '../shared/components/toast';
import { autoExpand, initModalTextarea } from '../shared/utils/textarea';
import type { VersionSnapshot } from '../core/types/types';

// ── Save version ──
export function saveVersion(label: string, manual = false): void {
  let forkPoint = -1;
  // Remember the branch we're currently on before any switch
  const branchBeforeSave = state.currentBranch;

  if (state.isViewingHistory) {
    const forkVersion = state.versions[state.currentVersion];
    forkPoint = state.currentVersion;
    const newBranch = {
      id: state.nextBranchId,
      name: 'branch-' + state.nextBranchId,
      color: state.branchColors[state.branches.length % state.branchColors.length],
      forkFrom: state.currentVersion,
      forkLabel: forkVersion ? forkVersion.label : '',
    };
    state.nextBranchId++;
    state.branches.push(newBranch);
    state.currentBranch = newBranch.id;

    // Remove future versions on the OLD branch (not the new one)
    const oldBranchVersions = state.versions
      .map((v, i) => ({ ...v, _idx: i }))
      .filter(v => v.branchId === branchBeforeSave);
    if (oldBranchVersions.length > 0) {
      const lastIdx = oldBranchVersions[oldBranchVersions.length - 1]._idx;
      if (state.currentVersion < lastIdx) {
        const removedIndices = new Set<number>();
        const keepVersions: VersionSnapshot[] = [];
        for (let i = 0; i < state.versions.length; i++) {
          if (state.versions[i].branchId !== branchBeforeSave || i <= state.currentVersion) {
            keepVersions.push(state.versions[i]);
          } else {
            removedIndices.add(i);
          }
        }
        state.versions = keepVersions;
        state.branches = state.branches.filter(b => {
          if (b.id === 0) return true;
          return !removedIndices.has(b.forkFrom);
        });
      }
    }
  }

  const snapshot: VersionSnapshot = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    label,
    time: new Date(),
    manual,
    branchId: state.currentBranch,
    forkPoint,
  };

  state.versions.push(snapshot);
  state.currentVersion = state.versions.length - 1;
  state.isViewingHistory = false;
  document.getElementById('versionOverlay')?.classList.remove('show');
  updateTimeline();
  scheduleSave();
}

// ── Save manual version ──
export function saveManualVersion(): void {
  const modal = document.getElementById('renameModal')!;
  const input = document.getElementById('renameInput') as HTMLTextAreaElement;
  input.value = '';
  input.style.height = 'auto';
  modal.classList.add('show');
  input?.focus();
}

/** Instant save with timestamp label, no modal. */
export function quickSaveVersion(): void {
  if (state.isViewingHistory) {
    showToast('请先回到最新版本再保存快照');
    return;
  }
  const now = new Date();
  const time = now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  saveVersion(`快照 ${time}`);
  showToast(`已保存版本快照 ${time}`);
}

export function closeRenameModal(): void {
  document.getElementById('renameModal')!.classList.remove('show');
}

export function confirmRename(): void {
  const name = (document.getElementById('renameInput') as HTMLTextAreaElement)?.value.trim() || t('rename-default');
  closeRenameModal();
  (document.getElementById('renameInput') as HTMLTextAreaElement).value = '';
  (document.getElementById('renameInput') as HTMLTextAreaElement).style.height = 'auto';

  // Delegate to saveVersion which handles branching, forkPoint, and future-version trimming
  saveVersion(name, true);
  showToast(`${t('toast-version-marked')}: ${name}`);
}

// ── Branch management ──
export function createBranchManual(): void {
  const input = document.getElementById('branchNameInput') as HTMLTextAreaElement;
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('branchModal')!.classList.add('show');
  input?.focus();
}

export function closeBranchModal(): void {
  document.getElementById('branchModal')!.classList.remove('show');
  const input = document.getElementById('branchNameInput') as HTMLTextAreaElement;
  input.value = '';
  input.style.height = 'auto';
}

export function confirmCreateBranch(): void {
  const nameInput = document.getElementById('branchNameInput') as HTMLTextAreaElement;
  const name = nameInput?.value.trim() || 'branch-' + state.nextBranchId;
  if (state.branches.some(b => b.name === name)) {
    showToast('分支名已存在，请换一个名称');
    nameInput?.focus();
    return;
  }
  const forkIdx = state.currentVersion;
  const newBranch = {
    id: state.nextBranchId,
    name,
    color: state.branchColors[state.branches.length % state.branchColors.length],
    forkFrom: forkIdx,
    forkLabel: state.versions[forkIdx] ? state.versions[forkIdx].label : '',
  };
  state.nextBranchId++;
  state.branches.push(newBranch);
  state.currentBranch = newBranch.id;

  const snapshot: VersionSnapshot = {
    cards: JSON.parse(JSON.stringify(state.cards)),
    connections: JSON.parse(JSON.stringify(state.connections)),
    label: t('branch-created'),
    time: new Date(),
    manual: false,
    branchId: newBranch.id,
    forkPoint: forkIdx,
  };
  state.versions.push(snapshot);
  state.currentVersion = state.versions.length - 1;
  state.isViewingHistory = false;
  document.getElementById('versionOverlay')?.classList.remove('show');

  closeBranchModal();
  updateTimeline();
  scheduleSave();
  showToast(`${t('toast-branch-created')}: ${name}`);
}

export function switchBranch(branchId: number): void {
  const branch = state.branches.find(b => b.id === branchId);
  if (!branch) return;
  state.currentBranch = branchId;
  const branchVersions = state.versions
    .map((v, i) => ({ ...v, _idx: i }))
    .filter(v => v.branchId === branchId);
  if (branchVersions.length > 0) {
    const latest = branchVersions[branchVersions.length - 1];
    state.currentVersion = latest._idx;
    state.cards = JSON.parse(JSON.stringify(latest.cards));
    state.connections = JSON.parse(JSON.stringify(latest.connections));
    state.isViewingHistory = false;
    renderCanvas();
    renderConnections();
    renderInbox();
  }
  document.getElementById('versionOverlay')?.classList.remove('show');
  closeGraphBranchDropdown();
  updateTimeline();
  scheduleSave();
  showToast(`${t('toast-switched-branch')}: ${branch.name}`);
}

export function renameBranch(): void {
  closeGraphBranchDropdown();
  const branch = state.branches.find(b => b.id === state.currentBranch);
  if (!branch) return;
  const newName = prompt(t('branch-rename-prompt'), branch.name);
  if (newName && newName.trim()) {
    const trimmed = newName.trim();
    if (trimmed !== branch.name && state.branches.some(b => b.name === trimmed)) {
      showToast('分支名已存在');
      return;
    }
    branch.name = trimmed;
    updateTimeline();
    scheduleSave();
  }
}

export function deleteBranch(): void {
  closeGraphBranchDropdown();
  if (state.currentBranch === 0) return;
  const branch = state.branches.find(b => b.id === state.currentBranch);
  if (!branch) return;
  if (!confirm(t('branch-delete-confirm', { name: branch.name }))) return;

  state.versions = state.versions.filter(v => v.branchId !== state.currentBranch);
  const remainingIndices = new Set(state.versions.map((_, i) => i));
  state.branches = state.branches.filter(b => {
    if (b.id === 0 || b.id === state.currentBranch) return b.id !== state.currentBranch;
    return remainingIndices.has(b.forkFrom) || b.forkFrom < 0;
  });
  state.branches = state.branches.filter(b => b.id !== state.currentBranch);

  state.currentBranch = 0;
  const mainVersions = state.versions
    .map((v, i) => ({ ...v, _idx: i }))
    .filter(v => v.branchId === 0);
  if (mainVersions.length > 0) {
    const latest = mainVersions[mainVersions.length - 1];
    state.currentVersion = latest._idx;
    state.cards = JSON.parse(JSON.stringify(latest.cards));
    state.connections = JSON.parse(JSON.stringify(latest.connections));
  } else {
    state.currentVersion = -1;
  }
  state.isViewingHistory = false;
  document.getElementById('versionOverlay')?.classList.remove('show');
  renderCanvas();
  renderConnections();
  renderInbox();
  updateTimeline();
  scheduleSave();
  showToast(t('toast-branch-deleted', { name: branch.name }));
}

export function restoreVersion(): void {
  const version = state.versions[state.currentVersion];
  if (version) state.currentBranch = version.branchId;
  saveVersion(t('restored-label', { label: version ? version.label : '' }));
  state.isViewingHistory = false;
  document.getElementById('versionOverlay')?.classList.remove('show');
  showToast(t('toast-restored'));
}

// ── Timeline ──
export function updateTimeline(): void {
  const tag = document.getElementById('graphBranchTag');
  if (tag) {
    const currentBranch = state.branches.find(b => b.id === state.currentBranch);
    tag.textContent = currentBranch ? currentBranch.name : 'main';
  }

  const badge = document.getElementById('fabBadge');
  if (badge) badge.textContent = String(state.versions.length);

  renderBranchGraph();

  const current = state.versions[state.currentVersion];
  if (current) {
    const timeStr = current.time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const infoText = document.getElementById('graphInfoText');
    if (infoText) infoText.textContent = `${current.label} · ${timeStr}`;
  }

  const restoreBtn = document.getElementById('graphRestoreBtn') as HTMLElement | null;
  if (restoreBtn) restoreBtn.style.display = state.isViewingHistory ? 'flex' : 'none';
}

// ── Jump to version ──
export function jumpToVersion(idx: number): void {
  if (idx < 0 || idx >= state.versions.length) return;
  const version = state.versions[idx];
  if (version) {
    const branchVersions = state.versions.filter(v => v.branchId === version.branchId);
    const isLatestOnBranch = branchVersions.length > 0 &&
      branchVersions[branchVersions.length - 1] === version;
    state.isViewingHistory = !isLatestOnBranch;
  } else {
    state.isViewingHistory = idx !== state.versions.length - 1;
  }
  state.currentVersion = idx;

  if (version) {
    state.cards = JSON.parse(JSON.stringify(version.cards));
    state.connections = JSON.parse(JSON.stringify(version.connections));
    state.currentBranch = version.branchId;
    renderCanvas();
    renderConnections();
    renderInbox();

    if (state.isViewingHistory) {
      const ago = getTimeAgo(version.time);
      const labelEl = document.getElementById('versionLabel');
      if (labelEl) labelEl.textContent = t('version-label', { ago, label: version.label });
      document.getElementById('versionOverlay')?.classList.add('show');
    } else {
      document.getElementById('versionOverlay')?.classList.remove('show');
    }
    updateTimeline();
  }
}

// ── Solidify conclusion ──
export function solidifyConclusion(): void {
  const selected = state.cards.filter(c => state.selectedCards.has(c.id));
  if (selected.length < 2) { showToast(t('toast-min-cards')); return; }

  const avgX = selected.reduce((s, c) => s + c.x, 0) / selected.length;
  const avgY = selected.reduce((s, c) => s + c.y, 0) / selected.length;
  const summary = selected.map(c => c.text.substring(0, 20)).join(' + ') + '… → 综合结论';

  const conclusion = {
    id: state.nextId++,
    text: t('conclusion-summary', { n: selected.length }),
    source: t('source-conclusion'),
    time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }),
    status: 'conclusion' as const,
    inCanvas: true,
    x: Math.round(avgX),
    y: Math.round(avgY - 80),
    summary,
    chainIds: selected.map(c => c.id),
  };
  state.cards.push(conclusion);

  selected.forEach(c => {
    state.connections.push({ from: conclusion.id, to: c.id, label: '支撑 Supports' });
  });

  state.selectedCards.clear();
  renderCanvas();
  renderConnections();
  saveVersion('固化结论 Solidified conclusion');
  showToast(t('toast-conclusion-done'));
}

export function toggleConclusionExpand(id: number): void {
  showToast(t('toast-expand'));
}

// ── Branch graph rendering ──
function renderBranchGraph(): void {
  const container = document.getElementById('gitgraphBody');
  if (!container) return;

  const branches = state.branches;
  const versions = state.versions;
  if (versions.length === 0) {
    container.innerHTML = '<div style="text-align:center;padding:40px 0;color:var(--muted);font:12px/1 var(--font-body)">暂无版本记录</div>';
    return;
  }

  function nameWidth(name: string): number {
    let w = 0;
    for (const ch of name) w += ch.charCodeAt(0) > 0x7f ? 9.5 : 5.4;
    return w;
  }
  const maxLabelW = 36;
  const colW = 40;
  const rowH = 40, padLeft = 20, padRight = 90, padTop = 16, padBottom = 20, nodeR = 6;

  const laneMap: Record<number, number> = {};
  branches.forEach((b, i) => { laneMap[b.id] = i; });

  const branchRowMap: Record<number, number> = {};
  const branchRowCount: Record<number, number> = {};

  function countSubtreeRows(branchId: number): number {
    const ownVersions = versions.filter(v => v.branchId === branchId);
    const ownCount = Math.max(ownVersions.length, 1);
    const children = branches.filter(b => b.forkFrom >= 0 && versions[b.forkFrom]?.branchId === branchId);
    let childTotal = 0;
    children.forEach(child => { childTotal += countSubtreeRows(child.id); });
    branchRowCount[branchId] = ownCount + childTotal;
    return branchRowCount[branchId];
  }

  function assignRows(branchId: number, startRow: number): void {
    branchRowMap[branchId] = startRow;
    const ownVersions = versions.filter(v => v.branchId === branchId);
    const ownCount = Math.max(ownVersions.length, 1);
    const children = branches.filter(b => b.forkFrom >= 0 && versions[b.forkFrom]?.branchId === branchId);
    let childRow = startRow + ownCount;
    children.forEach(child => {
      assignRows(child.id, childRow);
      childRow += branchRowCount[child.id];
    });
  }

  countSubtreeRows(0);
  assignRows(0, 0);

  const versionRow = new Array(versions.length);
  const branchVersionCount: Record<number, number> = {};
  versions.forEach((v, i) => {
    const bid = v.branchId;
    if (branchVersionCount[bid] === undefined) branchVersionCount[bid] = 0;
    versionRow[i] = branchRowMap[bid] + branchVersionCount[bid];
    branchVersionCount[bid]++;
  });

  const maxRow = Math.max(...versionRow, 0);
  const maxLane = Math.max(...Object.values(laneMap), 0);
  const svgW = padLeft + (maxLane + 1) * colW + padRight;
  const svgH = padTop + (maxRow + 1) * rowH + padBottom;

  function nodeX(branchId: number): number { return padLeft + laneMap[branchId] * colW + colW / 2; }
  function nodeY(row: number): number { return padTop + row * rowH; }

  let svg = `<svg class="gitgraph-svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">`;

  // Gradient masks for long branch names (left-aligned from lane edge, fade on right)
  let maskId = 0;
  const defs: string[] = [];
  const branchMasks: Record<number, string> = {};
  branches.forEach(branch => {
    const w = nameWidth(branch.name);
    if (w > maxLabelW) {
      const cx = nodeX(branch.id);
      const startX = cx - colW / 2 + 2;
      const fadeL = startX + maxLabelW - 12;
      const fadeR = startX + maxLabelW;
      const id = `bnm${maskId++}`;
      branchMasks[branch.id] = id;
      defs.push(
        `<mask id="${id}">` +
        `<rect x="${startX}" y="0" width="${maxLabelW - 12}" height="16" fill="white"/>` +
        `<rect x="${fadeL}" y="0" width="12" height="16" fill="url(#${id}g)"/>` +
        `</mask>` +
        `<linearGradient id="${id}g" x1="${fadeL}" y1="0" x2="${fadeR}" y2="0" gradientUnits="userSpaceOnUse">` +
        `<stop offset="0%" stop-color="white"/><stop offset="100%" stop-color="black"/>` +
        `</linearGradient>`
      );
    }
  });
  if (defs.length > 0) svg += `<defs>${defs.join('')}</defs>`;

  for (let lane = 0; lane <= maxLane; lane++) {
    const lx = padLeft + lane * colW;
    svg += `<rect x="${lx}" y="0" width="${colW}" height="${svgH}" fill="oklch(96% 0.002 240)" rx="0"/>`;
  }

  branches.forEach(branch => {
    const bv = versions.map((v, i) => ({ v, i })).filter(x => x.v.branchId === branch.id);
    if (bv.length === 0) return;
    const x = nodeX(branch.id);
    const y1 = nodeY(versionRow[bv[0].i]);
    const y2 = nodeY(versionRow[bv[bv.length - 1].i]);
    svg += y1 === y2
      ? `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y1 + 10}" stroke="${branch.color}" stroke-width="2.5" stroke-linecap="round"/>`
      : `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${branch.color}" stroke-width="2.5" stroke-linecap="round"/>`;
  });

  branches.forEach(branch => {
    if (branch.id === 0 || branch.forkFrom < 0) return;
    const forkIdx = branch.forkFrom;
    if (forkIdx >= versions.length) return;
    const parentBranchId = versions[forkIdx].branchId;
    const px = nodeX(parentBranchId);
    const py = nodeY(versionRow[forkIdx]);
    const cx = nodeX(branch.id);
    const childRow = branchRowMap[branch.id];
    const cy = nodeY(childRow);
    if (cx === px) {
      svg += `<line x1="${px}" y1="${py}" x2="${cx}" y2="${cy}" stroke="${branch.color}" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      const bendY = py + rowH * 0.5;
      const r = Math.min(Math.abs(cx - px) * 0.4, rowH * 0.25, 12);
      const dir = cx > px ? 1 : -1;
      svg += `<path d="M${px},${py} L${px},${bendY - r} Q${px},${bendY} ${px + dir * r},${bendY} L${cx - dir * r},${bendY} Q${cx},${bendY} ${cx},${bendY + r} L${cx},${cy}" fill="none" stroke="${branch.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  });

  versions.forEach((v, i) => {
    const branch = branches.find(b => b.id === v.branchId);
    if (!branch) return;
    const x = nodeX(v.branchId);
    const y = nodeY(versionRow[i]);
    const isCurrent = i === state.currentVersion;

    if (isCurrent) {
      svg += `<circle cx="${x}" cy="${y}" r="${nodeR + 5}" fill="none" stroke="${branch.color}" stroke-width="1.5" opacity="0.2"/>`;
      svg += `<circle cx="${x}" cy="${y}" r="${nodeR + 2}" fill="${branch.color}" opacity="0.15"/>`;
    }

    const fill = isCurrent ? branch.color : 'var(--surface)';
    const strokeW = isCurrent ? 2.5 : 2;
    svg += `<circle cx="${x}" cy="${y}" r="${nodeR}" fill="${fill}" stroke="${branch.color}" stroke-width="${strokeW}" style="cursor:pointer" data-idx="${i}" data-action="version-node"/>`;

    const labelX = padLeft + (maxLane + 1) * colW + 12;
    const labelColor = isCurrent ? 'var(--fg)' : 'var(--muted)';
    const labelWeight = isCurrent ? '600' : '400';
    const timeStr = v.time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    const displayLabel = v.manual ? v.label : (v.label.length > 18 ? v.label.substring(0, 18) + '…' : v.label);
    svg += `<text x="${labelX}" y="${y + 4}" font-family="var(--font-body)" font-size="11" font-weight="${labelWeight}" fill="${labelColor}" style="cursor:pointer" data-idx="${i}" data-action="version-node">${escapeHtml(displayLabel)}</text>`;
    svg += `<text x="${labelX}" y="${y + 17}" font-family="var(--font-mono)" font-size="9" fill="var(--muted)">${timeStr}</text>`;

    if (v.manual) {
      svg += `<circle cx="${x + nodeR + 3}" cy="${y - nodeR - 1}" r="3" fill="var(--accent)" stroke="var(--surface)" stroke-width="1"/>`;
    }
  });

  branches.forEach(branch => {
    const bv = versions.filter(v => v.branchId === branch.id);
    if (bv.length === 0) return;
    const cx = nodeX(branch.id);
    const mask = branchMasks[branch.id];
    if (mask) {
      const startX = cx - colW / 2 + 2;
      svg += `<text x="${startX}" y="10" text-anchor="start" font-family="var(--font-mono)" font-size="9" font-weight="600" fill="${branch.color}" mask="url(#${mask})">${escapeHtml(branch.name)}</text>`;
    } else {
      svg += `<text x="${cx}" y="10" text-anchor="middle" font-family="var(--font-mono)" font-size="9" font-weight="600" fill="${branch.color}">${escapeHtml(branch.name)}</text>`;
    }
  });

  svg += '</svg>';
  container.innerHTML = svg;

  const panel = document.getElementById('gitgraphPanel');
  if (panel) {
    const needed = svgW + 32;
    panel.style.width = Math.max(280, Math.min(needed, window.innerWidth - 80)) + 'px';
  }
}

// ── Gitgraph panel ──
export function toggleGitgraphPanel(): void {
  const panel = document.getElementById('gitgraphPanel')!;
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    positionGitgraphPanel();
    renderBranchGraph();
  }
}

function positionGitgraphPanel(): void {
  const fab = document.getElementById('gitgraphFab')!;
  const panel = document.getElementById('gitgraphPanel')!;
  const fabRect = fab.getBoundingClientRect();
  panel.style.right = 'auto';
  panel.style.bottom = 'auto';
  const dropdownWidth = 160;
  let panelLeft = Math.max(8 + dropdownWidth, Math.min(fabRect.left, window.innerWidth - panel.offsetWidth - 8));
  let panelTop = fabRect.top - panel.offsetHeight - 8;
  if (panelTop < 8) panelTop = fabRect.bottom + 8;
  panel.style.left = panelLeft + 'px';
  panel.style.top = panelTop + 'px';
}

// ── Branch dropdown ──
export function toggleGraphBranchDropdown(): void {
  const dropdown = document.getElementById('graphBranchDropdown')!;
  if (dropdown.classList.contains('show')) {
    closeGraphBranchDropdown();
    return;
  }
  dropdown.innerHTML = `<div class="branch-list"><div class="branch-list-title">${t('branch-list-title')}</div>${state.branches.map(b => {
    const count = state.versions.filter(v => v.branchId === b.id).length;
    const active = b.id === state.currentBranch;
    return `<div class="branch-menu-item${active ? ' active' : ''}" data-action="switch-branch" data-branch-id="${b.id}">
      <span class="branch-menu-dot" style="background:${b.color}"></span>
      <span class="branch-menu-name">${escapeHtml(b.name)}</span>
      <span class="branch-menu-count">${count}</span>
    </div>`;
  }).join('')}</div><div class="branch-actions">
    <div class="branch-menu-item" data-action="rename-branch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      <span class="branch-menu-name">${t('branch-rename')}</span>
    </div>
    ${state.currentBranch !== 0 ? `<div class="branch-menu-item" data-action="delete-branch">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:14px;height:14px;flex-shrink:0;color:oklch(55% 0.15 25)"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
      <span class="branch-menu-name" style="color:oklch(55% 0.15 25)">${t('branch-delete')}</span>
    </div>` : ''}
  </div>`;
  dropdown.classList.add('show');
}

export function closeGraphBranchDropdown(): void {
  document.getElementById('graphBranchDropdown')?.classList.remove('show');
}

function getTimeAgo(date: Date): string {
  const mins = Math.round((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return t('time-just-now');
  if (mins < 60) return t('time-mins-ago', { n: mins });
  const hrs = Math.round(mins / 60);
  return t('time-hours-ago', { n: hrs });
}

function escapeHtml(str: unknown): string {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Tooltip ──
export function showGraphTooltip(event: MouseEvent, idx: number): void {
  const v = state.versions[idx];
  if (!v) return;
  const branch = state.branches.find(b => b.id === v.branchId);
  const timeStr = v.time.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  const tip = document.getElementById('gitgraphTooltip')!;
  tip.innerHTML = `<strong>${v.label}</strong><br>${branch ? branch.name : '?'} · ${timeStr}${v.manual ? ' · ' + t('graph-manual') : ''}`;
  tip.style.left = (event.clientX + 12) + 'px';
  tip.style.top = (event.clientY - 10) + 'px';
  tip.classList.add('show');
}

export function hideGraphTooltip(): void {
  document.getElementById('gitgraphTooltip')?.classList.remove('show');
}

// ── Init version module ──
export function initVersion(): void {
  // Gitgraph FAB
  const fab = document.getElementById('gitgraphFab');
  if (fab) {
    let dragging = false, moved = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function onDown(e: MouseEvent | { preventDefault(): void; clientX: number; clientY: number }) {
      e.preventDefault();
      dragging = true;
      moved = false;
      const rect = fab!.getBoundingClientRect();
      fab!.style.top = rect.top + 'px';
      fab!.style.left = rect.left + 'px';
      fab!.style.bottom = 'auto';
      fab!.style.right = 'auto';
      startX = e.clientX;
      startY = e.clientY;
      startLeft = rect.left;
      startTop = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }

    function onMove(e: MouseEvent) {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
      fab!.style.left = Math.max(0, Math.min(startLeft + dx, window.innerWidth - 44)) + 'px';
      fab!.style.top = Math.max(0, Math.min(startTop + dy, window.innerHeight - 44)) + 'px';
    }

    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!moved) toggleGitgraphPanel();
      else if (document.getElementById('gitgraphPanel')?.classList.contains('open')) positionGitgraphPanel();
    }

    fab.addEventListener('mousedown', onDown);
  }

  // Gitgraph body delegated events
  const gitgraphBody = document.getElementById('gitgraphBody');
  if (gitgraphBody) {
    gitgraphBody.addEventListener('click', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const idx = target.dataset.idx;
      if (target.dataset.action === 'version-node' && idx !== undefined) {
        jumpToVersion(parseInt(idx));
      }
    });
    gitgraphBody.addEventListener('mouseenter', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action === 'version-node' && target.dataset.idx !== undefined) {
        showGraphTooltip(e, parseInt(target.dataset.idx));
      }
    }, true);
    gitgraphBody.addEventListener('mouseleave', (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.dataset.action === 'version-node') hideGraphTooltip();
    }, true);
  }

  // Branch dropdown delegated events
  const dropdown = document.getElementById('graphBranchDropdown');
  if (dropdown) {
    dropdown.addEventListener('click', (e: MouseEvent) => {
      const target = (e.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'switch-branch' && target.dataset.branchId) {
        switchBranch(parseInt(target.dataset.branchId));
      } else if (action === 'rename-branch') {
        renameBranch();
      } else if (action === 'delete-branch') {
        deleteBranch();
      }
    });
  }

  // Restore button
  const restoreBtn = document.getElementById('graphRestoreBtn');
  restoreBtn?.addEventListener('click', restoreVersion);

  // Branch tag
  const branchTag = document.getElementById('graphBranchTag');
  branchTag?.addEventListener('click', toggleGraphBranchDropdown);

  // Create branch button
  const createBranchBtn = document.getElementById('graphCreateBranch');
  createBranchBtn?.addEventListener('click', createBranchManual);

  // Rename modal
  const renameClose = document.getElementById('renameClose');
  const renameSave = document.getElementById('renameSave');
  renameClose?.addEventListener('click', closeRenameModal);
  renameSave?.addEventListener('click', confirmRename);
  initModalTextarea('renameInput', confirmRename);

  // Branch modal
  const branchClose = document.getElementById('branchClose');
  const branchCreate = document.getElementById('branchCreate');
  branchClose?.addEventListener('click', closeBranchModal);
  branchCreate?.addEventListener('click', confirmCreateBranch);
  initModalTextarea('branchNameInput', confirmCreateBranch);

  // Close dropdown on outside click
  document.addEventListener('click', (e: MouseEvent) => {
    const dropdown = document.getElementById('graphBranchDropdown');
    const tag = document.getElementById('graphBranchTag');
    if (dropdown?.classList.contains('show') && !dropdown.contains(e.target as Node) && !tag?.contains(e.target as Node)) {
      closeGraphBranchDropdown();
    }
  });

  // Resize observer for gitgraph
  const gitgraphBodyEl = document.getElementById('gitgraphBody');
  if (gitgraphBodyEl) {
    new ResizeObserver(() => { renderBranchGraph(); positionGitgraphPanel(); }).observe(gitgraphBodyEl);
  }
}
