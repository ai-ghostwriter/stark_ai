export function chunkText(text: string, size = 1000, overlap = 200): string[] {
  const clean = text.trim();
  if (clean.length === 0) return [];
  if (clean.length <= size) return [clean];
  const step = Math.max(1, size - overlap);
  const chunks: string[] = [];
  for (let i = 0; i < clean.length; i += step) {
    chunks.push(clean.slice(i, i + size));
    if (i + size >= clean.length) break;
  }
  return chunks;
}
