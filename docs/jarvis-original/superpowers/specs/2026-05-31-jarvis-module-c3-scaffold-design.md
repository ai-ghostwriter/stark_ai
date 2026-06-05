# JARVIS Module C3 — Project Scaffold — Design Spec

> Sotto-progetto **C**, fetta **C3**. Estende C1. Data: 2026-05-31 · Stato: approvato.

## 1. Obiettivo

Tool locale **`new_book(path)`** che crea lo scheletro canonico di un progetto KDP
`book_writer_system/` (le cartelle standard del workflow), idempotente.

## 2. Struttura creata (fonte di verità condivisa)

Le cartelle canoniche del workflow (dalla skill `kdp-workflow-orchestrator`):
```
<root>/PRODUCTION/bootstrap
<root>/PRODUCTION/dati
<root>/RENDERER/cowork/chapters
<root>/RENDERER/src/data
```
Codificate come costante **`PROJECT_DIRS`** in `core/kdpPhases.ts`, accanto al manifest delle fasi:
scaffold (C3) e state engine (C1) condividono così la stessa descrizione della struttura.

## 3. Architettura

- **`core/kdpPhases.ts`**: aggiungere `export const PROJECT_DIRS: string[]` (le 4 cartelle relative).
- **`tools/builtins/newBook.ts`** (nuovo): factory `makeNewBook(deps?) → ToolDef`.
  - `deps = { exists?, mkdir? }` — default `fs.existsSync` e `mkdirSync(p, {recursive:true})`, iniettabili per test.
  - Param `{ path }`. Per ogni dir in `PROJECT_DIRS`: se esiste → "già presente"; altrimenti `mkdir` → "creata". Idempotente.
  - Reply: riassunto creati / già presenti.
- **`cli.ts`**: registra `makeNewBook()` tra i builtin.

## 4. Error handling

| Caso | Comportamento |
|---|---|
| `path` mancante/vuoto | "Errore: specifica il path del progetto." |
| dir già esistenti | non ricreate; segnalate come "già presenti" (nessun errore) |
| successo | "Progetto scaffold in <root>. Create (N): … Già presenti (M): …" |

## 5. Scope

**Dentro:** costante `PROJECT_DIRS`, tool `new_book` (crea le cartelle, idempotente), registrazione, test.
**Fuori (futuro):** seeding di file template (buyer_persona_template.json, ecc.), creazione di
`workflow.md`/`book_config.json`, parametri di progetto (titolo, mercato). Scaffold = solo cartelle.

## 6. Testing

- `PROJECT_DIRS`: contiene le 4 cartelle canoniche attese.
- `new_book` con `exists`/`mkdir` iniettati (no fs reale):
  - `path` vuoto → errore;
  - tutte da creare → `mkdir` chiamato per ogni dir con `join(root, dir)`, reply "Create (4)";
  - alcune già presenti → quelle non ri-create, reply distingue create/già presenti.
- Regressione: i 65 test esistenti restano verdi.
