import { describe, it, expect } from "vitest";
import { makeBookStatus } from "../src/tools/builtins/bookStatus.js";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

const out = (id: string) => KDP_PHASES.find((p) => p.id === id)!.output;

// exists che considera "fatti" gli output passati (match per suffisso relativo)
function existsFor(doneRel: string[]) {
  return (absPath: string) => doneRel.some((rel) => absPath.endsWith(rel));
}

describe("book_status", () => {
  it("path vuoto → errore", async () => {
    const def = makeBookStatus({ exists: () => false });
    const out0 = String(await def.handler({ path: "" }));
    expect(out0).toMatch(/errore/i);
  });

  it("progetto vuoto → fase corrente 01 nella reply", async () => {
    const def = makeBookStatus({ exists: () => false });
    const r = String(await def.handler({ path: "/proj" }));
    expect(r).toContain("/proj");
    expect(r).toMatch(/Fase corrente: 01/);
  });

  it("con 01+02 fatti → reply indica prossima fase 03a", async () => {
    const def = makeBookStatus({ exists: existsFor([out("01"), out("02")]) });
    const r = String(await def.handler({ path: "/proj" }));
    expect(r).toMatch(/03a/);
    expect(r).toMatch(/Completate \(2\)/);
  });
});
