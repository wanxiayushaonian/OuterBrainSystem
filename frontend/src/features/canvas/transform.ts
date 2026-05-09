// ═══════════════════════════════════════════════════════
// Canvas coordinate transforms, zoom, pan
// ═══════════════════════════════════════════════════════
import { state } from '../../core/types/state';

/** Zoom centered on a specific screen point (clientX, clientY). */
export function zoomCanvas(delta: number, clientX?: number, clientY?: number): void {
  const oldZoom = state.zoom;
  const newZoom = Math.max(0.2, Math.min(3, oldZoom + delta));
  if (newZoom === oldZoom) return;

  if (clientX !== undefined && clientY !== undefined) {
    const rect = document.getElementById('canvasArea')!.getBoundingClientRect();
    // The canvas point under the cursor should stay fixed after zoom
    const mx = clientX - rect.left;
    const my = clientY - rect.top;
    state.pan.x = mx - (mx - state.pan.x) * (newZoom / oldZoom);
    state.pan.y = my - (my - state.pan.y) * (newZoom / oldZoom);
  }

  state.zoom = newZoom;
  applyTransform();
  updateZoomDisplay();
}

export function fitCanvas(): void {
  state.zoom = 1;
  state.pan = { x: 0, y: 0 };
  applyTransform();
  updateZoomDisplay();
}

export function updateZoomDisplay(): void {
  const el = document.getElementById('zoomDisplay');
  if (el) el.textContent = Math.round(state.zoom * 100) + '%';
}

export function applyTransform(): void {
  const canvas = document.getElementById('canvas');
  if (canvas) {
    canvas.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.zoom})`;
  }
}

export function screenToCanvas(clientX: number, clientY: number): { x: number; y: number } {
  const rect = document.getElementById('canvasArea')!.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.pan.x) / state.zoom,
    y: (clientY - rect.top - state.pan.y) / state.zoom,
  };
}
