// ═══════════════════════════════════════════════════════
// Proactive Notification System
// Polls backend for agent suggestions and shows actionable toasts
// ═══════════════════════════════════════════════════════
import { getAuthHeaders, handleAuthError } from '../../shared/utils/auth';
import { t } from '../../i18n';

interface Notification {
  id: string;
  type: string;
  message: string;
  card_ids: number[];
  created_at: number;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'notification-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showNotificationToast(notification: Notification): void {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = 'notification-toast';
  toast.innerHTML = `
    <div class="notification-body">${escapeHtml(notification.message)}</div>
    <div class="notification-actions">
      ${notification.card_ids.length > 0
        ? `<button class="notification-action-btn" data-card-id="${notification.card_ids[0]}">${t('notification-goto-card')}</button>`
        : ''}
      <button class="notification-dismiss-btn">${t('notification-dismiss')}</button>
    </div>
  `;

  // Action: go to card
  const actionBtn = toast.querySelector('.notification-action-btn');
  if (actionBtn) {
    actionBtn.addEventListener('click', () => {
      const cardId = parseInt((actionBtn as HTMLElement).dataset.cardId || '0');
      if (cardId) {
        // Dispatch custom event for card selection
        window.dispatchEvent(new CustomEvent('nexus-goto-card', { detail: { cardId } }));
      }
      dismissNotification(notification.id, toast);
    });
  }

  // Dismiss
  toast.querySelector('.notification-dismiss-btn')?.addEventListener('click', () => {
    dismissNotification(notification.id, toast);
  });

  container.appendChild(toast);

  // Auto-dismiss after 15 seconds
  setTimeout(() => {
    if (toast.parentElement) {
      dismissNotification(notification.id, toast);
    }
  }, 15000);
}

async function dismissNotification(id: string, toastEl: HTMLElement): Promise<void> {
  toastEl.remove();
  try {
    const res = await fetch(`/api/notifications/${id}/ack`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    handleAuthError(res);
  } catch { /* ignore */ }
}

async function fetchPendingNotifications(): Promise<void> {
  try {
    const res = await fetch('/api/notifications/pending', {
      headers: getAuthHeaders(),
    });
    handleAuthError(res);
    if (!res.ok) return;

    const notifications: Notification[] = await res.json();
    for (const n of notifications) {
      showNotificationToast(n);
    }
  } catch { /* ignore network errors */ }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize notification polling.
 * Pauses when page is hidden to save resources.
 */
export function initNotifications(): void {
  // Initial fetch
  fetchPendingNotifications();

  // Poll every 30 seconds
  pollTimer = setInterval(fetchPendingNotifications, 30000);

  // Pause/resume on visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    } else {
      if (!pollTimer) {
        fetchPendingNotifications();
        pollTimer = setInterval(fetchPendingNotifications, 30000);
      }
    }
  });
}
