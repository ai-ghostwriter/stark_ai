# JARVIS Module C1 — Book State Engine — Design Spec

> Sotto-progetto **C**, fetta **C1**. Estende il Core (A). Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Tool locale **`book_status(path)`** che, dato il path di un progetto KDP (`book_writer_system/`),
riporta in modo **deterministico**: fasi completate, fase corrente, file presenti/mancanti, prossima
azione. Porta in codice ciò che oggi fa la skill prompt-based `kdp-workflow-orchestrator`.

## 2. Keystone: phase manifest dichiarativo

Il workflow canonico 01-08 è codificato come **dati** (`core/kdpPhases.ts`). Ogni fase:
`{ id, name, skill, output, requires }` dove `output`/`requires` sono path relativi alla root del
progetto. È la fonte da cui derivano anche C2 (executors) e C3 (scaffold). Il motore di stato è
data-driven: aggiungere/cambiare una fase = cambiare il manifest, non la logica.

### Manifest (fasi a singolo file di output, deterministiche)

| id | name | output (relativo) | requires |
|----|------|-------------------|----------|
| 01 | research | `PRODUCTION/dati/cerebro_analysis.json` | — |
| 02 | persona | `PRODUCTION/bootstrap/buyer_persona.json` | — |
| 03a | title | `PRODUCTION/dati/kdp_title_result.json` | 01, 02 |
| 03b | hooks | `PRODUCTION/dati/hooks-usp.json` | 03a |
| 03c | brief | `PRODUCTION/dati/brief.json` | 03b, 02 |
| 04 | outline | `PRODUCTION/dati/outline.json` | 03c |
| 04.5 | image-manifest | `PRODUCTION/dati/editorial_image_manifest.json` | 04 |
| 05 | assembly | `RENDERER/src/data/bookPayload.json` | 04 |
| 06 | description | `PRODUCTION/dati/amazon_description.html` | 03c, 04 |
| 07a | brand | `PRODUCTION/dati/visual_brand_theme.json` | 03c |
| 07b | cover | `PRODUCTION/dati/cover_image_prompt.json` | 07a, 03c |
| 07c | aplus | `PRODUCTION/dati/a_plus_content_image_prompts.json` | 03c |
| 08 | compliance | `PRODUCTION/dati/kdp_compliance_report.json` | 05, 06 |

`requires` referenzia gli **output** di fasi precedenti (per id). La scrittura capitoli 05a (file
`chNN.output.json` a conteggio variabile) **non** è una fase tracciata in C1 — è gestita in C2,
dove serve la logica sul conteggio dall'outline. In C1 la fase `05 assembly` rappresenta il punto
"libro assemblato".

## 3. Architettura

- **`core/kdpPhases.ts`** (nuovo): `interface Phase`, costante `KDP_PHASES: Phase[]` (il manifest sopra, in ordine).
- **`core/bookState.ts`** (nuovo): funzione **pura** `computeStatus(existing: string[], phases: Phase[]) → BookStatus`.
  - `existing` = elenco dei path relativi che esistono sul disco.
  - Una fase è `done` se il suo `output` è in `existing`.
  - `actionable` = `!done && tutti i requires (output delle fasi referenziate) sono in existing`.
  - `currentPhaseId` = prima fase in ordine non `done` (null se tutte done).
  - `nextAction`: due casi — "Prossima fase: X → skill Y" (la corrente, sempre azionabile in pipeline lineare) oppure "Tutte le fasi completate." Il flag `actionable`/`missing` per-fase resta nel dato e serve al reporting delle fasi **successive** (es. perché 07b non è ancora pronta).
- **`tools/builtins/bookStatus.ts`** (nuovo): factory `makeBookStatus(deps?) → ToolDef`.
  - `deps = { exists?: (absPath: string) => boolean }` (default `fs.existsSync`, iniettabile per test).
  - Handler param `{ path: string }` (root del progetto). Calcola `existing` testando ogni `output` del manifest, chiama `computeStatus`, formatta una reply leggibile.
- **`cli.ts`**: registra `makeBookStatus()` tra i builtin.

## 4. Output reply (esempio)
```
Progetto: /path/book_writer_system
Fase corrente: 03c
Prossima azione: Prossima fase: 03c (brief) → skill kdp-book-brief.
Completate (4): 01 research, 02 persona, 03a title, 03b hooks
Mancanti (9): 03c brief, 04 outline, 04.5 image-manifest, 05 assembly, ...
```

## 5. Error handling
| Caso | Comportamento |
|---|---|
| `path` mancante/vuoto | "Errore: specifica il path del progetto." |
| path inesistente | nessun output trovato → current = 01, prossima azione fase 01 |
| tutte le fasi done | "Tutte le fasi completate." |

## 6. Scope
**Dentro:** manifest dati, `computeStatus` puro, tool `book_status` (read-only), registrazione, test.
**Fuori (fette successive):** esecuzione fasi (C2), scaffold progetto (C3), tracking capitoli 05a,
rilevazione conflitti input/output avanzati, lettura di `workflow.md`.

## 7. Testing
- `computeStatus` (puro, TDD): progetto vuoto → current 01 azionabile; con 01+02 presenti → current 03a azionabile; con solo 01 presente → fase **successiva** 03a non-actionable con `missing` = output di 02; tutte presenti → current null; `done` corretto per output esistenti.
- `book_status` tool con `exists` iniettato (no filesystem reale): reply contiene fase corrente e prossima azione; `path` vuoto → errore.
- Regressione: i 46 test esistenti restano verdi.
