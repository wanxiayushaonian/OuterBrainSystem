// ═══════════════════════════════════════════════════════
// LLM API client — connects to backend /api/llm/*
// ═══════════════════════════════════════════════════════

const API_BASE = '/api/llm';

export interface CompressResponse {
  title: string;
  original_length: number;
  compressed_length: number;
}

export interface KeywordsResponse {
  keywords: string[];
}

export interface FlowResponse {
  summary: string;
  next_steps: string[];
  gaps: string[];
}

export interface InquiryResponse {
  analysis: string;
  challenges: string[];
  suggested_cards: string[];
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`API error ${res.status}: ${err}`);
  }
  return res.json();
}

export async function compressTitle(text: string, maxLength = 10): Promise<CompressResponse> {
  return post('/compress', { text, max_length: maxLength });
}

export async function extractKeywords(text: string, maxKeywords = 8): Promise<KeywordsResponse> {
  return post('/keywords', { text, max_keywords: maxKeywords });
}

export async function analyzeFlow(cards: { id: number; text: string }[], connections: { from: number; to: number; label: string }[]): Promise<FlowResponse> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  const connData = connections.map(c => ({ from: c.from, to: c.to, label: c.label }));
  return post('/flow', { cards: cardData, connections: connData });
}

export async function aiInquiry(
  cards: { id: number; text: string }[],
  question?: string,
): Promise<InquiryResponse> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  return post('/inquiry', { cards: cardData, question });
}

export interface DiscoverSuggestion {
  from_id: number;
  to_id: number;
  label: string;
  reason: string;
}

export interface DiscoverResponse {
  suggestions: DiscoverSuggestion[];
}

export async function discoverRelationships(
  cards: { id: number; text: string }[],
  existingConnections: { from: number; to: number; label: string }[],
  maxSuggestions = 5,
): Promise<DiscoverResponse> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  const connData = existingConnections.map(c => ({ from: c.from, to: c.to, label: c.label }));
  return post('/discover', { cards: cardData, existing_connections: connData, max_suggestions: maxSuggestions });
}

export interface DebateResponse {
  thesis: string;
  antithesis: string;
  key_points: string[];
  synthesis: string;
}

export async function debateAnalysis(
  cards: { id: number; text: string }[],
  stance: 'for' | 'against' = 'against',
): Promise<DebateResponse> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  return post('/debate', { cards: cardData, stance });
}

export interface SearchResult {
  id: number;
  score: number;
  reason: string;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: ToolCall[];
}

export interface ChatResponse {
  reply: string;
}

export async function generalChat(
  messages: ChatMessage[],
  canvasContext: { cards?: { id: number; text: string; status?: string; openQuestion?: string }[]; connections?: { from: number; to: number; label: string }[]; groups?: { name: string; cardIds: number[] }[] },
): Promise<ChatResponse> {
  return post('/chat', { messages, canvas_context: canvasContext });
}

export async function semanticSearch(
  query: string,
  cards: { id: number; text: string }[],
  maxResults = 10,
): Promise<SearchResponse> {
  const cardData = cards.map(c => ({ id: c.id, text: c.text }));
  return post('/search', { query, cards: cardData, max_results: maxResults });
}
