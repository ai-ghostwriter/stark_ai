import { describe, it, expect } from "vitest";
import { cosineSimilarity, topK, type IndexEntry } from "../src/core/vectorStore.js";

describe("cosineSimilarity", () => {
  it("vettori identici -> 1", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });
  it("ortogonali -> 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("vettore nullo -> 0", () => {
    expect(cosineSimilarity([0, 0], [1, 1])).toBe(0);
  });
});

describe("topK", () => {
  const entries: IndexEntry[] = [
    { id: "a", text: "A", source: "s", vector: [1, 0] },
    { id: "b", text: "B", source: "s", vector: [0, 1] },
    { id: "c", text: "C", source: "s", vector: [0.9, 0.1] },
  ];
  it("ordina per score e taglia a k", () => {
    const hits = topK([1, 0], entries, 2);
    expect(hits.length).toBe(2);
    expect(hits[0]!.id).toBe("a");
    expect(hits[1]!.id).toBe("c");
    expect(hits[0]!.score).toBeGreaterThanOrEqual(hits[1]!.score);
  });
});
