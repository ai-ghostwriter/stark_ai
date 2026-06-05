export interface IndexEntry {
  id: string;
  text: string;
  source: string;
  vector: number[];
}

export interface KbIndex {
  model: string;
  dim: number;
  entries: IndexEntry[];
}

export interface SearchHit {
  id: string;
  text: string;
  source: string;
  score: number;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export function topK(query: number[], entries: IndexEntry[], k: number): SearchHit[] {
  return entries
    .map((e) => ({ id: e.id, text: e.text, source: e.source, score: cosineSimilarity(query, e.vector) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, k));
}
