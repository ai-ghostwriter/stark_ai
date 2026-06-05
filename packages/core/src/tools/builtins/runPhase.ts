import { existsSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../../llm/types.js";
import { KDP_PHASES } from "../../core/kdpPhases.js";
import { buildPhasePrompt } from "../../core/phasePrompt.js";
import { runCodex, type CodexRunner } from "../runners/codex.js";

export interface RunPhaseDeps {
  exists?: (absPath: string) => boolean;
  runner?: CodexRunner;
}

export function makeRunPhase(deps: RunPhaseDeps = {}): ToolDef {
  const exists = deps.exists ?? existsSync;
  const runner = deps.runner ?? runCodex;
  return {
    name: "run_phase",
    description:
      "Esegue UNA fase KDP delegando alla skill via Codex. Gated: la fase deve essere azionabile. Verifica l'output e si ferma per review.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "root del progetto book_writer_system" },
        phase: { type: "string", description: "id fase (es. 03c)" },
      },
      required: ["path", "phase"],
    },
    handler: async (args) => {
      const root = typeof args.path === "string" ? args.path.trim() : "";
      const phaseId = typeof args.phase === "string" ? args.phase.trim() : "";
      if (!root || !phaseId) return "Errore: servono 'path' e 'phase'.";

      const phase = KDP_PHASES.find((p) => p.id === phaseId);
      if (!phase) return `Errore: fase '${phaseId}' sconosciuta.`;

      const has = (rel: string) => exists(join(root, rel));
      if (has(phase.output)) {
        return `Fase ${phaseId} (${phase.name}) già completata: ${phase.output} esiste.`;
      }

      const reqOutputs = phase.requires.map(
        (rid) => KDP_PHASES.find((p) => p.id === rid)!.output,
      );
      const missing = reqOutputs.filter((rel) => !has(rel));
      if (missing.length > 0) {
        return `Fase ${phaseId} (${phase.name}) BLOCCATA — mancano: ${missing.join(", ")}.`;
      }

      const prompt = buildPhasePrompt(root, phase, reqOutputs);
      const res = await runner(prompt, { cwd: root });
      if (res.code !== 0) {
        return `Errore esecuzione fase ${phaseId} (exit ${res.code}): ${res.stderr.trim() || res.stdout.trim()}`;
      }
      if (!has(phase.output)) {
        return `Fase ${phaseId} eseguita ma l'output ${phase.output} non risulta creato. Output Codex: ${res.stdout.trim()}`;
      }
      return `Fase ${phaseId} (${phase.name}) completata: ${phase.output} creato. Rivedi prima di proseguire.`;
    },
  };
}
