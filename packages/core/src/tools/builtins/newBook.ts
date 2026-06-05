import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ToolDef } from "../../llm/types.js";
import { PROJECT_DIRS } from "../../core/kdpPhases.js";

export interface NewBookDeps {
  exists?: (absPath: string) => boolean;
  mkdir?: (absPath: string) => void;
}

export function makeNewBook(deps: NewBookDeps = {}): ToolDef {
  const exists = deps.exists ?? existsSync;
  const mkdir = deps.mkdir ?? ((p: string) => void mkdirSync(p, { recursive: true }));
  return {
    name: "new_book",
    description:
      "Crea lo scheletro canonico di un progetto KDP book_writer_system (cartelle PRODUCTION/RENDERER). Idempotente.",
    parameters: {
      type: "object",
      properties: {
        path: { type: "string", description: "root del nuovo progetto book_writer_system" },
      },
      required: ["path"],
    },
    handler: (args) => {
      const root = typeof args.path === "string" ? args.path.trim() : "";
      if (!root) return "Errore: specifica il path del progetto.";
      const created: string[] = [];
      const present: string[] = [];
      for (const dir of PROJECT_DIRS) {
        const abs = join(root, dir);
        if (exists(abs)) {
          present.push(dir);
        } else {
          mkdir(abs);
          created.push(dir);
        }
      }
      return [
        `Progetto scaffold in ${root}.`,
        `Create (${created.length}): ${created.join(", ") || "nessuna"}`,
        `Già presenti (${present.length}): ${present.join(", ") || "nessuna"}`,
      ].join("\n");
    },
  };
}
