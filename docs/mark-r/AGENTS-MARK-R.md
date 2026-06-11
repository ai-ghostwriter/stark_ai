# AGENTS.md — MARK-R (istruzioni per Codex CLI)

> Leggi PRIMA `docs/ARCHITECTURE.md`, poi `docs/SLICE-0-SPEC.md`, poi
> `docs/INTEGRATION-JARVIS-FRIDAY.md`. Questo file definisce regole operative e confini
> di responsabilità per Codex CLI all'interno del repo.

## Contesto in 10 righe

MARK-R: voice agent JARVIS-style, riprogettato con confini netti. Tre processi:
- `services/voice-core/` (Python): VAD/STT/TTS/barge-in. Possiede l'audio.
- `packages/agent-core/` (TypeScript): router LLM hybrid local↔cloud, FSM, tool dispatch MCP.
- `packages/hud/` (React/Tauri): UI pura.
Collante: `packages/contracts/` — eventi JSON su WebSocket locale, schemi Zod come unica
fonte di verità, Pydantic GENERATO (mai scritto a mano).
Regola suprema: **l'audio non attraversa mai il confine di linguaggio**; sul WS passano
solo eventi semantici (`stt.final`, `tts.speak`, `tool.call`, `route.info`, …).
Obiettivo corrente: **Slice 0** (scheletro + contratto + bus + eventi finti + make dev).
Criteri di accettazione vincolanti: `docs/SLICE-0-SPEC.md` §7.

## Ruolo di Codex CLI in questo repo

Default proposto (negoziabile via stark-forge, vedi `docs/STARK-FORGE-BRIEF.md`):
**Codex = lato Python + verifica incrociata.**
- Implementa `services/voice-core/` (per Slice 0: il processo stub che parla il contratto).
- Implementa la pipeline di codegen lato Python (consumo del JSON Schema → Pydantic via
  `datamodel-code-generator`) e i contract test pytest sulle golden fixtures.
- Fa review incrociata del lavoro TS di Claude Code (e viceversa) tramite note in `.session/notes/`.

NON modificare senza accordo esplicito:
- `packages/contracts/src/**` (fonte di verità — proprietà condivisa, modifiche solo concordate)
- `packages/agent-core/**` (default: dominio Claude Code, salvo manifest diverso)

## Convenzioni vincolanti

### Python
- Python 3.12. Dipendenze: **uv** (`pyproject.toml` + `uv.lock`). Mai `pip install` fuori lockfile.
- Async: asyncio + `websockets`. Niente thread per l'I/O di rete.
- I modelli evento in `voice_core/contracts_gen/` sono GENERATI: non editarli; rigenera con `make codegen`.
- Ogni messaggio in ingresso dal WS è validato con i modelli Pydantic generati; messaggi
  invalidi → log warning + drop, mai crash.
- Test: pytest + pytest-asyncio. Type check: mypy strict. Lint: ruff.

### Generali
- Lingua codice/commit: inglese. Conventional Commits.
- Branch: `development` → `uat` → `main`. Mai push diretto su `main`.
- Nessun segreto in repo; `.env` da `.env.example`.
- Niente auto-install a runtime (anti-pattern esplicitamente bandito dal progetto).

## Protocollo di collaborazione con Claude Code
1. All'avvio sessione: leggi `.session/manifest.json` (se presente) per i path assegnati.
2. Lavora SOLO nei tuoi path. Se ti serve una modifica in un path altrui, scrivi una
   richiesta in `.session/notes/codex-to-claude-NN.md` e fermati su quel punto.
3. A fine task: aggiorna `.session/notes/` con cosa hai fatto, cosa resta, eventuali
   decisioni prese (formato: titolo, file toccati, decisioni, open points).
4. Conflitti sul contratto: vince lo schema Zod in `packages/contracts`; se ritieni serva
   cambiarlo, proponi la modifica in nota, non applicarla unilateralmente.

## Comandi
```bash
make dev        # avvia i processi in parallelo
make test       # vitest + pytest + contract test
make codegen    # Zod → JSON Schema → Pydantic (esegui dopo OGNI modifica al contratto)
make lint       # eslint + prettier + mypy + ruff
```

## Definition of Done
1. Codice + test; `make test` e `make lint` verdi.
2. Contract test verdi (se hai toccato codegen o consumo eventi).
3. Nota di sessione aggiornata in `.session/notes/`.
4. Commit atomici, messaggi convenzionali.
