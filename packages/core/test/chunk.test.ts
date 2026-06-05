import { describe, it, expect } from "vitest";
import { chunkText } from "../src/core/chunk.js";

describe("chunkText", () => {
  it("testo vuoto -> []", () => {
    expect(chunkText("   ")).toEqual([]);
  });

  it("testo più corto di size -> un solo chunk", () => {
    expect(chunkText("ciao mondo", 100, 20)).toEqual(["ciao mondo"]);
  });

  it("testo lungo -> più chunk con overlap", () => {
    const text = "a".repeat(2500);
    const chunks = chunkText(text, 1000, 200);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]!.length).toBe(1000);
    // il secondo chunk inizia a size-overlap = 800
    expect(chunks[1]).toBe(text.slice(800, 1800));
  });
});
