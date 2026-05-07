// ═══════════════════════════════════════════════════════
// Gravity Keyword Wall — keyword selection during card creation
// ═══════════════════════════════════════════════════════
import { extractKeywords } from '../../features/chat/api';

export interface KeywordOption {
  text: string;
  selected: boolean;
  weight: number; // 1-3, affects visual size
}

let currentKeywords: KeywordOption[] = [];
let onConfirmCallback: ((keywords: string[]) => void) | null = null;

export async function showKeywordWall(text: string, onConfirm: (keywords: string[]) => void): Promise<void> {
  onConfirmCallback = onConfirm;
  const wall = document.getElementById('gravityWall');
  if (!wall) return;

  // Show loading state
  wall.innerHTML = `
    <div class="gravity-wall-header">
      <span class="gravity-wall-title">Extracting keywords...</span>
    </div>
    <div class="gravity-wall-body">
      <div class="gravity-loading">Analyzing text...</div>
    </div>
  `;
  wall.classList.add('show');

  try {
    const result = await extractKeywords(text);
    currentKeywords = result.keywords.map((k, i) => ({
      text: k,
      selected: true,
      weight: i < 3 ? 3 : i < 5 ? 2 : 1,
    }));
    renderKeywordWall();
  } catch (err) {
    console.error('Keyword extraction failed:', err);
    // Fallback: extract simple keywords from text
    const fallback = extractFallbackKeywords(text);
    currentKeywords = fallback.map(k => ({ text: k, selected: true, weight: 1 }));
    renderKeywordWall();
  }
}

function extractFallbackKeywords(text: string): string[] {
  // Simple fallback: split by common delimiters and take unique words > 2 chars
  const words = text
    .replace(/[，。！？、；：""''（）\[\]【】]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .filter((w, i, arr) => arr.indexOf(w) === i);
  return words.slice(0, 8);
}

function renderKeywordWall(): void {
  const wall = document.getElementById('gravityWall');
  if (!wall) return;

  const keywordHtml = currentKeywords.map((k, i) => {
    const sizeClass = k.weight === 3 ? 'large' : k.weight === 2 ? 'medium' : 'small';
    const selectedClass = k.selected ? 'selected' : '';
    return `<span class="gravity-keyword ${sizeClass} ${selectedClass}" data-idx="${i}">${escapeHtml(k.text)}</span>`;
  }).join('');

  wall.innerHTML = `
    <div class="gravity-wall-header">
      <span class="gravity-wall-title">Select keywords</span>
      <button class="gravity-wall-close" id="gravityWallClose">×</button>
    </div>
    <div class="gravity-wall-body">${keywordHtml}</div>
    <div class="gravity-wall-footer">
      <span class="gravity-wall-hint">Click to toggle · ${currentKeywords.filter(k => k.selected).length} selected</span>
      <button class="gravity-wall-confirm" id="gravityWallConfirm">Confirm</button>
    </div>
  `;

  // Event listeners
  wall.querySelectorAll('.gravity-keyword').forEach(el => {
    el.addEventListener('click', () => {
      const idx = parseInt(el.getAttribute('data-idx')!);
      currentKeywords[idx].selected = !currentKeywords[idx].selected;
      renderKeywordWall();
    });
  });

  document.getElementById('gravityWallClose')?.addEventListener('click', hideKeywordWall);
  document.getElementById('gravityWallConfirm')?.addEventListener('click', confirmKeywords);
}

function confirmKeywords(): void {
  const selected = currentKeywords.filter(k => k.selected).map(k => k.text);
  if (onConfirmCallback) onConfirmCallback(selected);
  hideKeywordWall();
}

export function hideKeywordWall(): void {
  const wall = document.getElementById('gravityWall');
  if (wall) wall.classList.remove('show');
  currentKeywords = [];
  onConfirmCallback = null;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
