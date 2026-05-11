// ═══════════════════════════════════════════════════════
// Session manager for frontend
// ═══════════════════════════════════════════════════════
import type { Session } from './types';
import { SessionError, ApiError } from '../../shared/utils/error';
import { getAuthHeaders } from '../../shared/utils/auth';

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private currentSessionId: string | null = null;

  async createSession(
    spaceId: number,
    providerId: string,
    title?: string
  ): Promise<Session> {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          space_id: spaceId,
          provider_id: providerId,
          title: title || '新对话'
        })
      });

      if (!response.ok) {
        throw ApiError.requestFailed('/api/sessions', response.status, response.statusText);
      }

      const session: Session = await response.json();
      this.sessions.set(session.id, session);
      this.currentSessionId = session.id;

      // Store in global for runtime access
      (window as any).__currentSessionId = session.id;

      return session;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw SessionError.createFailed(error instanceof Error ? error.message : 'unknown');
    }
  }

  async loadSession(sessionId: string): Promise<Session> {
    // Check cache first
    if (this.sessions.has(sessionId)) {
      const session = this.sessions.get(sessionId)!;
      this.currentSessionId = sessionId;
      (window as any).__currentSessionId = sessionId;
      return session;
    }

    try {
      // Fetch from server
      const response = await fetch(`/api/sessions/${sessionId}`, { headers: getAuthHeaders() });
      if (!response.ok) {
        if (response.status === 404) {
          throw SessionError.notFound(sessionId);
        }
        throw ApiError.requestFailed(`/api/sessions/${sessionId}`, response.status, response.statusText);
      }

      const session: Session = await response.json();
      this.sessions.set(session.id, session);
      this.currentSessionId = sessionId;
      (window as any).__currentSessionId = sessionId;

      return session;
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw SessionError.loadFailed(sessionId, error instanceof Error ? error.message : 'unknown');
    }
  }

  async listSessions(spaceId: number, limit: number = 50): Promise<Session[]> {
    const response = await fetch(`/api/sessions?space_id=${spaceId}&limit=${limit}`, { headers: getAuthHeaders() });
    if (!response.ok) {
      throw new Error(`Failed to list sessions: ${response.statusText}`);
    }

    const sessions: Session[] = await response.json();

    // Update cache
    for (const session of sessions) {
      this.sessions.set(session.id, session);
    }

    return sessions;
  }

  async deleteSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`/api/sessions/${sessionId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      if (!response.ok) {
        throw ApiError.requestFailed(`/api/sessions/${sessionId}`, response.status, response.statusText);
      }

      this.sessions.delete(sessionId);

      if (this.currentSessionId === sessionId) {
        this.currentSessionId = null;
        (window as any).__currentSessionId = null;
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AppError') {
        throw error;
      }
      throw SessionError.deleteFailed(sessionId, error instanceof Error ? error.message : 'unknown');
    }
  }

  async updateTitle(sessionId: string, title: string): Promise<void> {
    const response = await fetch(`/api/sessions/${sessionId}/title`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
      body: JSON.stringify({ title })
    });

    if (!response.ok) {
      throw new Error(`Failed to update title: ${response.statusText}`);
    }

    // Update cache
    const session = this.sessions.get(sessionId);
    if (session) {
      session.title = title;
    }
  }

  getCurrentSession(): Session | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) || null;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  setCurrentSession(sessionId: string) {
    this.currentSessionId = sessionId;
    (window as any).__currentSessionId = sessionId;
  }

  clearCurrentSession() {
    this.currentSessionId = null;
    (window as any).__currentSessionId = null;
  }
}

// Global singleton instance
export const sessionManager = new SessionManager();
