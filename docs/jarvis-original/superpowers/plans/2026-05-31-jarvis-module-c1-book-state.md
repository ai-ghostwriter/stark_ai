# JARVIS Module C1 — Book State Engine — Implementation Plan

**Goal:** Tool locale `book_status(path)` che riporta in modo deterministico lo stato di un progetto KDP (fasi fatte, corrente, mancanti, prossima azione), guidato da un phase manifest dichiarativo.

**Architecture:** Manifest dati (`kdpPhases.ts`) → funzione pura `computeStatus` (`bookState.ts`) → tool factory `makeBookStatus` (filesystem + format). Il filesystem è iniettabile (`exists`) per test senza disco.

**Tech Stack:** Node/TS, vitest, `node:fs`/`node:path`. Branch: `feat/module-c1`. Codebase: `/Users/abstract/Documents/Claude/Projects/JARVIS/jarvis/`. Import con estensione `.js`. Nessuna nuova dipendenza npm.

**Precondizione:** A+B+D in `main` (46 test verdi).

---

## Task C1-1: Phase manifest

**Files:** Create `jarvis/src/core/kdpPhases.ts`; Test `jarvis/test/kdpPhases.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/kdpPhases.test.ts`:
```typescript
import { describe, it, expect } from "vitest";
import { KDP_PHASES } from "../src/core/kdpPhases.js";

describe("KDP_PHASES manifest", () => {
  it("è ordinato e non vuoto, con id unici", () => {
    expect(KDP_PHASES.length).toBeGreaterThanOrEqual(13);
    const ids = KDP_PHASES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("ogni 'requires' referenzia id esistenti e precedenti", () => {
    const seen = new Set<string>();
    for (const ph of KDP_PHASES) {
      for (const r of ph.requires) {
        expect(seen.has(r)).toBe(true); // require già visto = precedente
      }
      seen.add(ph.id);
    }
  });

  it("ogni fase ha output con path relativo non vuoto", () => {
    for (const ph of KDP_PHASES) {
      expect(ph.output.length).toBeGreaterThan(0);
      expect(ph.output.startsWith("/")).toBe(false);
    }
  });
});
```

- [ ] **Step 2: Run → FAIL**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npx vitest run test/kdpPhases.test.ts`

- [ ] **Step 3: Implementa `kdpPhases.ts`**:
```typescript
export interface Phase {
  id: string;
  name: string;
  skill: string;
  output: string;
  requires: string[];
}

export const KDP_PHASES: Phase[] = [
  { id: "01", name: "research", skill: "kdp-research-analyzer", output: "PRODUCTION/dati/cerebro_analysis.json", requires: [] },
  { id: "02", name: "persona", skill: "(umano)", output: "PRODUCTION/bootstrap/buyer_persona.json", requires: [] },
  { id: "03a", name: "title", skill: "kdp-title-generator", output: "PRODUCTION/dati/kdp_title_result.json", requires: ["01", "02"] },
  { id: "03b", name: "hooks", skill: "kdp-hooks-usp", output: "PRODUCTION/dati/hooks-usp.json", requires: ["03a"] },
  { id: "03c", name: "brief", skill: "kdp-book-brief", output: "PRODUCTION/dati/brief.json", requires: ["03b", "02"] },
  { id: "04", name: "outline", skill: "kdp-book-outline", output: "PRODUCTION/dati/outline.json", requires: ["03c"] },
  { id: "04.5", name: "image-manifest", skill: "kdp-editorial-image-manifest", output: "PRODUCTION/dati/editorial_image_manifest.json", requires: ["04"] },
  { id: "05", name: "assembly", skill: "kdp-book-assembler", output: "RENDERER/src/data/bookPayload.json", requires: ["04"] },
  { id: "06", name: "description", skill: "kdp-amazon-description-html", output: "PRODUCTION/dati/amazon_description.html", requires: ["03c", "04"] },
  { id: "07a", name: "brand", skill: "kdp-visual-brand-theme", output: "PRODUCTION/dati/visual_brand_theme.json", requires: ["03c"] },
  { id: "07b", name: "cover", skill: "kdp-cover-image-prompt", output: "PRODUCTION/dati/cover_image_prompt.json", requires: ["07a", "03c"] },
  { id: "07c", name: "aplus", skill: "kdp-a-plus-content-image-prompts", output: "PRODUCTION/dati/a_plus_content_image_prompts.json", requires: ["03c"] },
  { id: "08", name: "compliance", skill: "kdp-compliance-agent", output: "PRODUCTION/dati/kdp_compliance_report.json", requires: ["05", "06"] },
];
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/kdpPhases.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/kdpPhases.ts jarvis/test/kdpPhases.test.ts
git commit -m "feat(C1): phase manifest KDP dichiarativo"
```

---

## Task C1-2: computeStatus (funzione pura)

**Files:** Create `jarvis/src/core/bookState.ts`; Test `jarvis/test/bookState.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/bookState.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/bookState.test.ts`

- [ ] **Step 3: Implementa `bookState.ts`**:
```typescript
import type { Phase } from "./kdpPhases.js";

export interface PhaseStatus {
  id: string;
  name: string;
  skill: string;
  done: boolean;
  actionable: boolean;
  missing: string[];
}

export interface BookStatus {
  phases: PhaseStatus[];
  currentPhaseId: string | null;
  nextAction: string;
}

export function computeStatus(existing: string[], phases: Phase[]): BookStatus {
  const has = (p: string) => existing.includes(p);
  const outputById = new Map(phases.map((p) => [p.id, p.output]));

  const statuses: PhaseStatus[] = phases.map((ph) => {
    const done = has(ph.output);
    const missing = ph.requires
      .map((rid) => outputById.get(rid))
      .filter((o): o is string => o !== undefined && !has(o));
    const actionable = !done && missing.length === 0;
    return { id: ph.id, name: ph.name, skill: ph.skill, done, actionable, missing };
  });

  const current = statuses.find((s) => !s.done) ?? null;
  const nextAction = current
    ? `Prossima fase: ${current.id} (${current.name}) → skill ${current.skill}.`
    : "Tutte le fasi completate.";

  return { phases: statuses, currentPhaseId: current ? current.id : null, nextAction };
}
```

- [ ] **Step 4: Run → PASS** (5 test)
Run: `npx vitest run test/bookState.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/core/bookState.ts jarvis/test/bookState.test.ts
git commit -m "feat(C1): computeStatus puro — stato fasi da file esistenti"
```

---

## Task C1-3: Tool book_status (factory)

**Files:** Create `jarvis/src/tools/builtins/bookStatus.ts`; Test `jarvis/test/bookStatus.test.ts`.

- [ ] **Step 1: Test che fallisce** `test/bookStatus.test.ts`:
```typescript
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
```

- [ ] **Step 2: Run → FAIL**
Run: `npx vitest run test/bookStatus.test.ts`

- [ ] **Step 3: Implementa `bookStatus.ts`**:
```typescript
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
```

- [ ] **Step 4: Run → PASS** (3 test)
Run: `npx vitest run test/bookStatus.test.ts`

- [ ] **Step 5: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/tools/builtins/bookStatus.ts jarvis/test/bookStatus.test.ts
git commit -m "feat(C1): tool book_status (read-only, exists iniettabile)"
```

---

## Task C1-4: Registrazione nel CLI

**Files:** Modify `jarvis/src/cli.ts`.

- [ ] **Step 1: Modifica `cli.ts`** — import in cima vicino agli altri tool:
```typescript
import { makeBookStatus } from "./tools/builtins/bookStatus.js";
```
Poi nella registrazione builtin (riga che registra `getTime, getWeather, readFileTool, ingestCerebro`), aggiungi `makeBookStatus()`:
```typescript
  const ingestCerebro = makeIngestCerebro({ cerebroScript: cfg.cerebroScript });
  const bookStatus = makeBookStatus();
  for (const t of [getTime, getWeather, readFileTool, ingestCerebro, bookStatus]) registry.register(t);
```

- [ ] **Step 2: Typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm run typecheck` → pulito.

- [ ] **Step 3: Commit**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add jarvis/src/cli.ts
git commit -m "feat(C1): registra book_status tra i builtin CLI"
```

---

## Task C1-5: Verifica finale

- [ ] **Step 1: Suite intera + typecheck**
Run: `cd /Users/abstract/Documents/Claude/Projects/JARVIS/jarvis && npm test && npm run typecheck`
Expected: tutti verdi (46 precedenti + 3 manifest + 5 bookState + 3 bookStatus = 57), typecheck pulito.

- [ ] **Step 2: Commit finale (se servono fix)**
```bash
cd /Users/abstract/Documents/Claude/Projects/JARVIS
git add -A && git commit -m "test(C1): verifica finale module C1 verde" || echo "nulla da committare"
```

---

## Self-Review (eseguita)
- **Spec coverage:** §2 manifest → C1-1; §3 computeStatus → C1-2; §3 tool → C1-3; §3 cli → C1-4; §5 error handling → C1-3 (test path vuoto); §7 testing → C1-1/2/3. ✓
- **Placeholder scan:** nessuno; codice reale ovunque. ✓
- **Type consistency:** `Phase`, `KDP_PHASES`, `PhaseStatus`, `BookStatus`, `computeStatus`, `makeBookStatus`, `BookStatusDeps` coerenti; la factory ritorna `ToolDef` registrabile. nextAction a due rami (azionabile/completato), coerente con pipeline lineare — nessun ramo morto. ✓
