import type { ToolDef } from "../../llm/types.js";
import { runPython, type PythonRunner } from "../runners/python.js";

export interface IngestCerebroDeps {
  cerebroScript: string;
  runner?: PythonRunner;
}

export function makeIngestCerebro(deps: IngestCerebroDeps): ToolDef {
  const runner = deps.runner ?? runPython;
  return {
    name: "ingest_cerebro",
    description:
      "Analizza export XLSX Helium10 Cerebro di competitor e produce cerebro_analysis.json (keyword per titolo, backend, ads, A+).",
    parameters: {
      type: "object",
      properties: {
        inputs: {
          type: "array",
          items: { type: "string" },
          description: "Voci nel formato ASIN=percorso.xlsx",
        },
        output: { type: "string", description: "Path JSON di output (default cerebro_analysis.json)" },
      },
      required: ["inputs"],
    },
    handler: async (args) => {
      const inputs = Array.isArray(args.inputs) ? args.inputs.map(String) : [];
      if (inputs.length === 0) {
        return "Errore: nessun input. Fornisci voci ASIN=percorso.xlsx.";
      }
      const output =
        typeof args.output === "string" && args.output ? args.output : "cerebro_analysis.json";
      const res = await runner(deps.cerebroScript, ["--input", ...inputs, "--output", output]);
      if (res.code !== 0) {
        return `Errore ingest_cerebro (exit ${res.code}): ${res.stderr.trim() || res.stdout.trim()}`;
      }
      return `cerebro_analysis pronto in ${output}. ${res.stdout.trim()}`;
    },
  };
}
