import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../../llm/types.js";
import { KDP_PHASES } from "../../core/kdpPhases.js";
import { computeStatus } from "../../core/bookState.js";

export interface BookStatusDeps {
  exists?: (absPath: string) => boolean;
}

export function makeBookStatus(deps: BookStatusDeps = {}): ToolDef {
  const exists = deps.exists ?? existsSync;
  return {
    name: "book_status",
    description:
      "Stato di un progetto KDP book_writer_system: fasi completate, fase corrente, file mancanti, prossima azione.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "path della root del progetto book_writer_system" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const root = typeof args.path === "string" ? args.path.trim() : "";
      if (!root) return "Errore: specifica il path del progetto.";
      const existing = KDP_PHASES.map((p) => p.output).filter((rel) => exists(join(root, rel)));
      const st = computeStatus(existing, KDP_PHASES);
      const done = st.phases.filter((p) => p.done);
      const todo = st.phases.filter((p) => !p.done);
      const fmt = (p: { id: string; name: string }) => `${p.id} ${p.name}`;
      return [
        `Progetto: ${root}`,
        `Fase corrente: ${st.currentPhaseId ?? "—"}`,
        `Prossima azione: ${st.nextAction}`,
        `Completate (${done.length}): ${done.map(fmt).join(", ") || "nessuna"}`,
        `Mancanti (${todo.length}): ${todo.map(fmt).join(", ") || "nessuna"}`,
      ].join("\n");
    },
  };
}
