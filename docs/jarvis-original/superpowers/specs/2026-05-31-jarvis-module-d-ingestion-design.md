# JARVIS Module D — Ingestion (tool-runner) — Design Spec

> Sotto-progetto **D**. Estende il Core (A). Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Dare a JARVIS la capacità di **trasformare export grezzi in JSON canonici**, esposti come tool
locali. Primo input: **XLSX Helium10 Cerebro** → `cerebro_analysis.json`.

## 2. Principio: orchestrazione, non riscrittura

La logica di parsing + bucketing strategico **esiste già** e funziona in
`SKILLS/kdp-research-analyzer/scripts/parse_cerebro.py` (CLI:
`--input "ASIN=file.xlsx" ... --output cerebro_analysis.json`, dipende da `openpyxl`, già installato).

JARVIS **non la riscrive** (DRY): la **invoca** via subprocess. È il ruolo di orchestrazione
previsto dal brief ("chiamare gli step, lanciare gli script"). Questo evita una libreria XLSX in
Node e riusa codice testato sul campo.

## 3. Architettura

- **`tools/runners/python.ts`** (nuovo): helper riusabile.
  - `type PythonResult = { code: number; stdout: string; stderr: string }`
  - `type PythonRunner = (script: string, args: string[]) => Promise<PythonResult>`
  - `export const runPython: PythonRunner` — usa `node:child_process` spawn(`python3`, ...).
    Thin glue I/O (come `ollama.ts`/`fetch`): non unit-testato direttamente, verificato via typecheck
    e usato con runner mockato nei test del tool.
- **`tools/builtins/ingestCerebro.ts`** (nuovo): **factory** `makeIngestCerebro(deps) → ToolDef`.
  - `deps = { cerebroScript: string; runner?: PythonRunner }` (runner default = `runPython`, iniettabile per test).
  - Tool `ingest_cerebro`, parametri `{ inputs: string[] (ASIN=path.xlsx), output?: string }`.
  - Handler: costruisce gli args, chiama il runner, ritorna esito (path output + stdout) o errore chiaro (exit≠0 → stderr).
- **`config.ts`**: aggiunge `cerebroScript` (env `JARVIS_CEREBRO_SCRIPT`, default = path assoluto allo script della skill).
- **`cli.ts`**: registra `makeIngestCerebro({ cerebroScript: cfg.cerebroScript })` accanto agli altri builtin.

## 4. Pattern riusabile

`runPython` è la fondazione per i prossimi tool di orchestrazione (es. `merge_asin.py`,
`war_machine_kdp.py`) e per il **Modulo C** (KDP Orchestrator), che invocherà altri script/skill
con lo stesso meccanismo.

## 5. Error handling

| Caso | Comportamento |
|---|---|
| `inputs` vuoto | "Errore: nessun input. Fornisci voci ASIN=percorso.xlsx." |
| script esce con code≠0 (es. openpyxl mancante, file inesistente) | "Errore ingest_cerebro (exit N): {stderr}" — niente crash |
| spawn fallisce (python3 assente) | runner ritorna code -1 con messaggio; il tool riporta l'errore |

## 6. Scope

**Dentro:** `runPython` + tool `ingest_cerebro` (wrap di `parse_cerebro.py`) + config path + registrazione + test.
**Fuori (rimandati):** estrattori LLM-assistiti (Perplexity→buyer_persona, recensioni→pain point) — pattern
diverso (modello locale), futuro D2; altri script (`merge_asin`, `war_machine`) — stesso pattern, tool successivi.

## 7. Caveat runtime

Il tool dipende dall'ambiente Python della skill (`python3` + `openpyxl`). Se mancano, l'errore dello
script viene riportato all'utente senza crashare JARVIS. Documentato in CLAUDE.md.

## 8. Testing

- `ingest_cerebro` con **runner mockato** (no Python nei test):
  - successo (code 0) → reply contiene il path output e lo stdout;
  - fallimento (code≠0) → reply contiene "Errore" e lo stderr;
  - `inputs` vuoto → messaggio di errore dedicato;
  - **argomenti corretti**: il runner riceve `["--input", ...inputs, "--output", output]`.
- `config`: default `cerebroScript` presente.
- Regressione: i 40 test esistenti restano verdi.
