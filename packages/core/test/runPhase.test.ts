import { describe, it, expect, vi } from "vitest";
import { makeRunPhase } from "../src/tools/builtins/runPhase.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const out = (id: string) => KDP_PHASES.find((p) => p.id === id)!.output;

// exists basato su un set MUTABILE di path relativi (match per suffisso)
function existsFromSet(set: Set<string>) {
  return (abs: string) => [...set].some((rel) => abs.endsWith(rel));
}

describe("run_phase", () => {
  it("path/phase mancanti → errore", async () => {
    const def = makeRunPhase({ exists: () => false, runner: vi.fn() });
    expect(String(await def.handler({ path: "", phase: "01" }))).toMatch(/errore/i);
  });

  it("fase sconosciuta → errore, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: () => false, runner });
    const r = String(await def.handler({ path: "/proj", phase: "ZZ" }));
    expect(r).toMatch(/sconosciut/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("output già presente → già completata, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: existsFromSet(new Set([out("01")])), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(r).toMatch(/già completata/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("requires mancanti → BLOCCATA, runner non chiamato", async () => {
    const runner = vi.fn();
    const def = makeRunPhase({ exists: existsFromSet(new Set()), runner });
    const r = String(await def.handler({ path: "/proj", phase: "03a" }));
    expect(r).toMatch(/bloccata/i);
    expect(runner).not.toHaveBeenCalled();
  });

  it("azionabile + runner crea output → completata, prompt con la skill", async () => {
    const set = new Set<string>(); // 01 ha requires [] → azionabile
    const runner = vi.fn(async (_prompt: string, _opts: { cwd: string }) => {
      set.add(out("01"));
      return { code: 0, stdout: "ok", stderr: "" };
    });
    const def = makeRunPhase({ exists: existsFromSet(set), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(String(runner.mock.calls[0]![0])).toContain("kdp-research-analyzer");
    expect(r).toMatch(/completata/i);
  });

  it("runner ok ma output non creato → segnala", async () => {
    const runner = vi.fn(async () => ({ code: 0, stdout: "boh", stderr: "" }));
    const def = makeRunPhase({ exists: existsFromSet(new Set()), runner });
    const r = String(await def.handler({ path: "/proj", phase: "01" }));
    expect(r).toMatch(/non risulta creato/i);
  });
});
