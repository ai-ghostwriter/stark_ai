import { readFileSync } from "node:fs";
import type { ToolDef } from "../../llm/types.js";

// Rischio deliberato: legge path arbitrari, quindi una prompt injection potrebbe esfiltrare file locali.
// Accettabile qui perché JARVIS è un assistente locale single-user.
export const readFileTool: ToolDef = {
  name: "read_file",
  description: "Legge il contenuto testuale di un file dato il path assoluto.",
  parameters: {
    type: "object",
    properties: { path: { type: "string", description: "path assoluto del file" } },
    required: ["path"],
  },
  handler: (args) => {
    const path = String(args.path ?? "");
    try {
      return readFileSync(path, "utf8");
    } catch {
      return `Errore: file non trovato o non leggibile: ${path}`;
    }
  },
};
