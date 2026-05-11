// ═══════════════════════════════════════════════════════
// Auth utility — Bearer token from localStorage
// ═══════════════════════════════════════════════════════

const TOKEN_KEY = 'nexus-token';

export function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY);
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(TOKEN_KEY);
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = '/login';
}

export function handleAuthError(response: Response): void {
  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    window.location.href = '/login';
  }
}
