// ═══════════════════════════════════════════════════════
// Image Card Component
// Displays images with optional caption
// ═══════════════════════════════════════════════════════
import type { Card } from '../../core/types/types';

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export interface ImageMetadata {
  image: {
    url: string;
    alt?: string;
    caption?: string;
    width?: number;
    height?: number;
  };
}

export function renderImageCard(card: Card, container: HTMLElement): void {
  if (!isImageCard(card) || !card.metadata) return;

  const meta = card.metadata as ImageMetadata;
  const img = meta.image;

  container.innerHTML = `
    <div class="image-card">
      ${card.text ? `<div class="image-card-title">${escapeHtml(card.text)}</div>` : ''}
      <div class="image-card-wrapper">
        <img
          src="${escapeHtml(img.url)}"
          alt="${escapeHtml(img.alt || card.text || '')}"
          class="image-card-img"
          ${img.width ? `width="${img.width}"` : ''}
          ${img.height ? `height="${img.height}"` : ''}
          loading="lazy"
        />
      </div>
      ${img.caption ? `<div class="image-card-caption">${escapeHtml(img.caption)}</div>` : ''}
    </div>
  `;
}

export function isImageCard(card: Card): boolean {
  return card.type === 'image';
}
