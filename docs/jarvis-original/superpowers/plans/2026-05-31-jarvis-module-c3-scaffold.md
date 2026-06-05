# JARVIS Module C3 — Project Scaffold — Implementation Plan

**Goal:** Tool `new_book(path)` che crea lo scheletro canonico `book_writer_system/` (4 cartelle), idempotente.

**Architecture:** Costante `PROJECT_DIRS` (accanto al manifest) → tool factory `makeNewBook` con `mkdir`/`exists` iniettabili.

**Tech Stack:** Node/TS, vitest, `node:fs`/`node:path`. Branch: `feat/module-c3`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import `.js`. Nessuna nuova dipendenza npm.

**Precondizione:** A+B+D+C1+C2 in `main` (65 test verdi).

---

## Task C3-1: Costante PROJECT_DIRS

**Files:** Modify `jarvis/src/core/kdpPhases.ts`; Test `jarvis/test/kdpPhases.test.ts`.

- [ ] **Step 1: Aggiungi test** in `test/kdpPhases.test.ts` (nuovo describe in fondo al file):
```typescript
import { PROJECT_DIRS } from "../src/core/kdpPhases.js";

describe("PROJECT_DIRS", () => {
  it("contiene le 4 cartelle canoniche", () => {
    expect(PROJECT_DIRS).toEqual([
      "PRODUCTION/bootstrap",
      "PRODUCTION/dati",
      "RENDERER/cowork/chapters",
      "RENDERER/src/data",
    ]);
  });
});
```
Nota: aggiungi `PROJECT_DIRS` all'import esistente da `kdpPhases.js` se preferisci un solo import; in alternativa lascia l'import dedicato mostrato sopra.

- [ ] **Step 2: Run → FAIL**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npx vitest run test/kdpPhases.test.ts`

- [ ] **Step 3: Aggiungi a `kdpPhases.ts`** (in fondo al file, dopo `KDP_PHASES`):
```typescript
export const PROJECT_DIRS: string[] = [
  "PRODUCTION/bootstrap",
  "PRODUCTION/dati",
  "RENDERER/cowork/chapters",
  "RENDERER/src/data",
];
```

- [ ] **Step 4: Run → PASS**
Run: `npx vitest run test/kdpPhases.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/kdpPhases.ts jarvis/test/kdpPhases.test.ts
git commit -m "feat(C3): costante PROJECT_DIRS (struttura canonica)"
```

---

## Task C3-2: Tool new_book (factory)

**Files:** Create `jarvis/src/tools/builtins/newBook.ts`; Test `jarvis/test/newBook.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/newBook.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { makeNewBook } from "../src/tools/builtins/newBook.js";
import { PROJECT_DIRS } from "../src/core/kdpPhases.js";
import { join } from "node:path";

describe("new_book", () => {
  it("path vuoto → errore", async () => {
    const def = makeNewBook({ exists: () => false, mkdir: vi.fn() });
    expect(String(await def.handler({ path: "" }))).toMatch(/errore/i);
  });

  it("tutte da creare → mkdir per ogni dir con join(root, dir)", async () => {
    const mkdir = vi.fn();
    const def = makeNewBook({ exists: () => false, mkdir });
    const r = String(await def.handler({ path: "/proj" }));
    expect(mkdir).toHaveBeenCalledTimes(PROJECT_DIRS.length);
    for (const d of PROJECT_DIRS) {
      expect(mkdir).toHaveBeenCalledWith(join("/proj", d));
    }
    expect(r).toMatch(/Create \(4\)/);
  });

  it("alcune già presenti → non ricreate, reply distingue", async () => {
    const present = join("/proj", PROJECT_DIRS[0]!);
    const mkdir = vi.fn();
    const def = makeNewBook({ exists: (p) => p === present, mkdir });
    const r = String(await def.handler({ path: "/proj" }));
    expect(mkdir).toHaveBeenCalledTimes(PROJECT_DIRS.length - 1);
    expect(r).toMatch(/Già presenti \(1\)/);
    expect(r).toMatch(/Create \(3\)/);
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/newBook.test.ts`

- [ ] **Step 3: Implementa `newBook.ts`**:
```typescript
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
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/newBook.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/newBook.ts jarvis/test/newBook.test.ts
git commit -m "feat(C3): tool new_book (scaffold idempotente, mkdir iniettabile)"
```

---

## Task C3-3: Registrazione nel CLI

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `cli.ts`** — import in cima vicino agli altri tool:
```typescript
import { makeNewBook } from "./tools/builtins/newBook.js";
```
Poi nella registrazione builtin (riga che registra `... bookStatus, runPhase`), aggiungi `newBook`:
```typescript
  const runPhase = makeRunPhase();
  const newBook = makeNewBook();
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus, runPhase, newBook]) registry.register(t);
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(C3): registra new_book tra i builtin CLI"
```

---

## Task C3-4: Verifica finale

- [ ] **Step 1: Suite intera + typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm test && npm run typecheck`
Expected: tutti verdi (65 precedenti + 1 PROJECT_DIRS + 3 newBook = 69), typecheck pulito.

- [ ] **Step 2: Smoke test reale opzionale** (crea uno scheletro vero in /tmp; non necessario per il merge):
Run: `cd jarvis && npm run dev` poi: `usa new_book su /tmp/test_book` → verifica con `ls -R /tmp/test_book`.

- [ ] **Step 3: Commit finale (se servono fix)**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add -A && git commit -m "test(C3): verifica finale module C3 verde" || echo "nulla da committare"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §2 PROJECT_DIRS → C3-1; §3 tool → C3-2; §3 cli → C3-3; §4 error handling → C3-2 (path vuoto, idempotenza); §6 testing → C3-1/2. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `PROJECT_DIRS`, `makeNewBook`, `NewBookDeps` coerenti; factory ritorna `ToolDef` registrabile. `mkdir` default avvolge `mkdirSync` con `void` per tipare il ritorno `void`. ✓
