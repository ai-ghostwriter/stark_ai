import { describe, it, expect } from "vitest";
import { computeStatus } from "../src/core/bookState.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const out = (id: string) => KDP_PHASES.find((p) => p.id === id)!.output;

describe("computeStatus", () => {
  it("progetto vuoto → corrente 01 azionabile", () => {
    const st = computeStatus([], KDP_PHASES);
    expect(st.currentPhaseId).toBe("01");
    expect(st.phases.find((p) => p.id === "01")!.actionable).toBe(true);
    expect(st.nextAction).toMatch(/01/);
  });

  it("output esistente → fase done", () => {
    const st = computeStatus([out("01")], KDP_PHASES);
    expect(st.phases.find((p) => p.id === "01")!.done).toBe(true);
  });

  it("con 01 e 02 fatti → corrente 03a azionabile", () => {
    const st = computeStatus([out("01"), out("02")], KDP_PHASES);
    expect(st.currentPhaseId).toBe("03a");
    expect(st.phases.find((p) => p.id === "03a")!.actionable).toBe(true);
    expect(st.nextAction).toMatch(/skill/i);
  });

  it("con solo 01 fatto → 03a non azionabile, missing include output di 02", () => {
    const st = computeStatus([out("01")], KDP_PHASES);
    const p03a = st.phases.find((p) => p.id === "03a")!;
    expect(p03a.actionable).toBe(false);
    expect(p03a.missing).toContain(out("02"));
  });

  it("tutte le fasi done → corrente null, messaggio completato", () => {
    const all = KDP_PHASES.map((p) => p.output);
    const st = computeStatus(all, KDP_PHASES);
    expect(st.currentPhaseId).toBeNull();
    expect(st.nextAction).toMatch(/completat/i);
  });
});
