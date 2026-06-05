# JARVIS Module C2 — Phase Executor — Design Spec

> Sotto-progetto **C**, fetta **C2**. Estende C1 + D. Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Tool locale **`run_phase(path, phase)`** che **esegue UNA fase KDP** delegando alla skill della
fase via **Codex** (`codex exec`), gated dallo stato del progetto, con verifica dell'output e stop
per review. Chiude il loop esecutivo iniziato con C1 (read-only) e D (`ingest_cerebro`).

## 2. Decisione: esecuzione via delega Codex

La generazione pesante KDP è prodotta da skill prompt-based, non da codice eseguibile nel runtime
Node. `run_phase` **delega a Codex** (gratis, ChatGPT Plus), che già conosce le skill. JARVIS non
replica l'orchestrazione delle skill (sarebbe portare dentro ~10 skill — YAGNI).

**Forward-compat (hook documentato, NON implementato qui):** quando misureremo che una fase rende
meglio con Claude Opus, si aggiungerà un campo opzionale `executor?: "codex" | "api"` a `Phase` e un
ramo in `run_phase` che instrada quella fase sulla API nativa col tier di B. È una modifica
**additiva** (nessun rework). Non la implementiamo ora per non introdurre un branch non testabile.

## 3. Vincoli di sicurezza

- **Una fase per chiamata**, on-demand (id esplicito). Niente pipeline automatica → rispetta i gate
  di approvazione umani del `kdp-master-agent`.
- **Gated:** la fase si esegue solo se azionabile (output non ancora presente, requires soddisfatti).
- **Verifica post-run:** dopo Codex, controlla che il file output sia stato creato; altrimenti segnala.

## 4. Architettura

- **`tools/runners/codex.ts`** (nuovo): `runCodex(prompt, { cwd }) → CommandResult`, parallelo a
  `runPython`. Thin glue su `child_process` (`codex exec` con i flag ephemeral/full-access). Non
  unit-testato direttamente; usato con runner iniettato nei test.
- **`core/phasePrompt.ts`** (nuovo): funzione **pura** `buildPhasePrompt(root, phase, reqOutputs) → string`
  che costruisce il prompt per Codex (skill da usare, progetto, input disponibili, file output atteso,
  "esegui solo questa fase").
- **`tools/builtins/runPhase.ts`** (nuovo): factory `makeRunPhase(deps?) → ToolDef`.
  - `deps = { exists?, runner?: CodexRunner }` (default `fs.existsSync` + `runCodex`, iniettabili).
  - Param `{ path, phase }`. Flusso: valida → trova fase nel manifest → se output già esiste = "già
    completata" → se requires mancanti = "BLOCCATA" → costruisce prompt → `runner` → verifica output → reply.
- **`cli.ts`**: registra `makeRunPhase()` tra i builtin.

## 5. Error handling

| Caso | Comportamento (niente crash) |
|---|---|
| `path`/`phase` mancante | "Errore: servono 'path' e 'phase'." |
| fase id inesistente nel manifest | "Errore: fase 'X' sconosciuta." |
| output già presente | "Fase X già completata: <output> esiste." — **non** chiama il runner |
| requires mancanti | "Fase X BLOCCATA — mancano: …" — **non** chiama il runner |
| Codex exit≠0 | "Errore esecuzione fase X (exit N): <stderr>" |
| Codex ok ma output non creato | "Fase X eseguita ma l'output … non risulta creato. Output Codex: …" |
| successo | "Fase X completata: <output> creato. Rivedi prima di proseguire." |

## 6. Scope

**Dentro:** `runCodex`, `buildPhasePrompt` (puro), tool `run_phase` (delega+gate+verifica), registrazione, test.
**Fuori (futuro):** executor API nativo per-fase (hook §2), pipeline multi-fase automatica, tracking
capitoli 05a, retry/espansione, scaffold (C3).

## 7. Testing

- `buildPhasePrompt` (puro): il prompt contiene il nome skill, il path output atteso, la root, e l'elenco input.
- `run_phase` con `exists` + `runner` iniettati (no Codex/fs reali):
  - fase sconosciuta → errore, runner non chiamato;
  - output già presente → "già completata", runner non chiamato;
  - requires mancanti → "BLOCCATA", runner non chiamato;
  - azionabile + runner crea l'output → "completata", runner chiamato una volta, prompt contiene la skill;
  - runner ok ma output non creato → "non risulta creato".
- Regressione: i 57 test esistenti restano verdi.
