import { describe, it, expect, vi } from "vitest";
import { makeIngestCerebro } from "../src/tools/builtins/ingestCerebro.js";
import type { PythonResult } from "../src/tools/runners/python.js";

function tool(result: PythonResult) {
  const runner = vi.fn(async () => result);
  const def = makeIngestCerebro({ cerebroScript: "/scripts/parse_cerebro.py", runner });
  return { def, runner };
}

describe("ingest_cerebro", () => {
  it("successo: reply con path output e stdout", async () => {
    const { def } = tool({ code: 0, stdout: "42 keyword analizzate", stderr: "" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"], output: "out.json" }));
    expect(out).toContain("out.json");
    expect(out).toContain("42 keyword");
  });

  it("default output cerebro_analysis.json se non specificato", async () => {
    const { def } = tool({ code: 0, stdout: "ok", stderr: "" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"] }));
    expect(out).toContain("cerebro_analysis.json");
  });

  it("fallimento: exit code != 0 → Errore con stderr", async () => {
    const { def } = tool({ code: 1, stdout: "", stderr: "ERRORE: installa openpyxl" });
    const out = String(await def.handler({ inputs: ["B01=a.xlsx"] }));
    expect(out).toMatch(/errore/i);
    expect(out).toContain("openpyxl");
  });

  it("inputs vuoto → messaggio di errore dedicato", async () => {
    const { def } = tool({ code: 0, stdout: "", stderr: "" });
    const out = String(await def.handler({ inputs: [] }));
    expect(out).toMatch(/nessun input/i);
  });

  it("passa al runner gli argomenti corretti", async () => {
    const { def, runner } = tool({ code: 0, stdout: "ok", stderr: "" });
    await def.handler({ inputs: ["B01=a.xlsx", "B02=b.xlsx"], output: "o.json" });
    expect(runner).toHaveBeenCalledWith("/scripts/parse_cerebro.py", [
      "--input", "B01=a.xlsx", "B02=b.xlsx", "--output", "o.json",
    ]);
  });
});
