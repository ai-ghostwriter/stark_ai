import { describe, it, expect } from "vitest";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

describe("KDP_PHASES manifest", () => {
  it("è ordinato e non vuoto, con id unici", () => {
    expect(KDP_PHASES.length).toBeGreaterThanOrEqual(13);
    const ids = KDP_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ogni 'requires' referenzia id esistenti e precedenti", () => {
    const seen = new Set<string>();
    for (const ph of KDP_PHASES) {
      for (const r of ph.requires) {
        expect(seen.has(r)).toBe(true); // require già visto = precedente
      }
      seen.add(ph.id);
    }
  });

  it("ogni fase ha output con path relativo non vuoto", () => {
    for (const ph of KDP_PHASES) {
      expect(ph.output.length).toBeGreaterThan(0);
      expect(ph.output.startsWith("/")).toBe(false);
    }
  });
});

import { PROJECT_DIRS } from "../src/core/kdpPhases.js";

describe("PROJECT_DIRS", () => {
  it("contiene le 4 cartelle canoniche", () => {
    expect(PROJECT_DIRS).toEqual([
      "PRODUCTION/bootstrap",
      "PRODUCTION/dati",
      "RENDERER/cowork/chapters",
      "RENDERER/src/data",
    ]);
  });
});
