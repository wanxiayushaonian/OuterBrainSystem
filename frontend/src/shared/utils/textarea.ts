// ═══════════════════════════════════════════════════════
// Auto-expanding textarea utility for modal inputs
// ═══════════════════════════════════════════════════════

/** Reset textarea height and re-expand to fit content */
export function autoExpand(textarea: HTMLTextAreaElement): void {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

/**
 * Wire up a modal textarea: auto-expand on input, Ctrl/Cmd+Enter to submit.
 * Returns the textarea element (or null if not found).
 */
export function initModalTextarea(
  id: string,
  onSubmit: () => void,
  onClose?: () => void,
): HTMLTextAreaElement | null {
  const el = document.getElementById(id) as HTMLTextAreaElement | null;
  if (!el) return null;

  el.addEventListener('input', () => autoExpand(el));
  el.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === 'Escape' && onClose) {
      onClose();
    }
  });

  return el;
}
