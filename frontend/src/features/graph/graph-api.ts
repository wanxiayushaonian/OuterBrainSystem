// ═══════════════════════════════════════════════════════
// Knowledge Graph API client
// ═══════════════════════════════════════════════════════
import { getAuthHeaders, handleAuthError } from '../../shared/utils/auth';
import type { GraphData } from '../../core/types/types';

const API_BASE = '/api/graph';

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { handleAuthError(res); throw new Error('Unauthorized'); }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) { handleAuthError(res); throw new Error('Unauthorized'); }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...getAuthHeaders() },
  });
  if (res.status === 401) { handleAuthError(res); throw new Error('Unauthorized'); }
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function fetchGraph(spaceId: number): Promise<GraphData> {
  return get(`/${spaceId}`);
}

export async function extractGraph(
  cards: { id: number; text: string }[],
  connections?: { from: number; to: number; label: string }[],
): Promise<GraphData> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  const connData = connections?.map(c => ({ from: c.from, to: c.to, label: c.label })) || [];
  return post('/extract', { cards: cardData, connections: connData });
}

export async function applyGraph(
  spaceId: number,
  data: GraphData,
): Promise<{ ok: boolean; entities: number; relations: number }> {
  return post(`/${spaceId}/apply`, data);
}

export async function deleteEntity(
  spaceId: number,
  entityId: number,
): Promise<{ ok: boolean }> {
  return del(`/${spaceId}/entities/${entityId}`);
}

export async function deleteRelation(
  spaceId: number,
  relationId: number,
): Promise<{ ok: boolean }> {
  return del(`/${spaceId}/relations/${relationId}`);
}
