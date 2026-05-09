// ═══════════════════════════════════════════════════════
// Spaces API client — connects to backend /api/spaces/*
// ═══════════════════════════════════════════════════════

const API_BASE = '/api/spaces';

export interface SpaceInfo {
  id: number;
  name: string;
  created_at: number;
  updated_at: number;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function fetchSpaces(): Promise<SpaceInfo[]> {
  return get('');
}

export async function createSpace(name: string): Promise<SpaceInfo> {
  return post('', { name });
}

export async function deleteSpace(id: number): Promise<{ ok: boolean }> {
  return del(`/${id}`);
}

export async function renameSpace(id: number, name: string): Promise<{ ok: boolean }> {
  return patch(`/${id}`, { name });
}

export async function loadSpaceState(id: number): Promise<Record<string, unknown>> {
  return get(`/${id}/state`);
}

export async function saveSpaceState(id: number, state: Record<string, unknown>): Promise<{ ok: boolean }> {
  return put(`/${id}/state`, state);
}
