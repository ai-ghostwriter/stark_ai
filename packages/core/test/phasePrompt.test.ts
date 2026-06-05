import { describe, it, expect } from "vitest";
import { buildPhasePrompt } from "../src/core/phasePrompt.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const phase = (id: string) => KDP_PHASES.find((p) => p.id === id)!;

describe("buildPhasePrompt", () => {
  it("contiene skill, output atteso, root", () => {
    const p = phase("03c"); // brief, skill kdp-book-brief
    const out = buildPhasePrompt("/proj", p, ["PRODUCTION/dati/hooks-usp.json"]);
    expect(out).toContain("kdp-book-brief");
    expect(out).toContain("/proj/PRODUCTION/dati/brief.json");
    expect(out).toContain("/proj");
    expect(out).toContain("hooks-usp.json");
  });

  it("gestisce fase senza requires", () => {
    const p = phase("01");
    const out = buildPhasePrompt("/proj", p, []);
    expect(out).toContain("kdp-research-analyzer");
    expect(out).toMatch(/nessun input/i);
  });
});
