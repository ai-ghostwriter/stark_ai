# CLAUDE.md — MARK-R

> Istruzioni operative per Claude Code. Leggi PRIMA `docs/ARCHITECTURE.md` (design completo),
> poi `docs/SLICE-0-SPEC.md` (cosa costruire ora), poi `docs/INTEGRATION-JARVIS-FRIDAY.md`
> (come inglobare il sistema persona esistente).

## Cos'è questo progetto

MARK-R è la riprogettazione "solida" di un voice agent JARVIS-style (riferimento:
FatihMakes/Mark-XL). Architettura poliglotta a 3 processi con contratto a eventi tipizzato:

- `services/voice-core/` — **Python** — VAD, STT, TTS, barge-in. Possiede l'audio. NON decide nulla.
- `packages/agent-core/` — **TypeScript** — FSM conversazione, router LLM hybrid local↔cloud, tool dispatch via MCP.
- `packages/hud/` — **React + Tauri** — presentazione pura.
- `packages/contracts/` — **Zod = unica fonte di verità** degli eventi; da qui si generano i modelli Pydantic.

Regola architetturale suprema: **i byte audio non attraversano mai il confine di linguaggio.**
Sul WebSocket passano solo eventi semantici JSON (`stt.final`, `tts.speak`, `tool.call`, …).

## Stato corrente / obiettivo immediato

**Slice 0**: scheletro monorepo + `@contracts` completo + WS event bus + driver di eventi
finti + `make dev` + contract test golden-JSON in CI. Niente audio reale, niente LLM reale.
Criteri di accettazione in `docs/SLICE-0-SPEC.md` §7 — sono vincolanti.

## Convenzioni vincolanti

### Generali
- Lingua del codice/commenti/commit: **inglese**. Lingua delle discussioni con l'utente: italiano.
- Commit: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`).
- Branch flow: `development` → `uat` → `main`. PR sempre, mai push diretto su `main`.
- **Niente installazioni a runtime.** Tutte le dipendenze nei lockfile (pnpm-lock.yaml, uv.lock).
- Nessun segreto in repo: API key solo via `.env` (vedi `.env.example`).

### TypeScript (`packages/*`)
- pnpm workspaces. Node ≥ 20. ESM only (`"type": "module"`).
- Strict mode totale: `strict: true`, `noUncheckedIndexedAccess: true`.
- Validazione runtime ai confini: **ogni** messaggio in ingresso dal WS passa da `Event.parse()`.
- Test: Vitest. Le funzioni di policy (`route()`, dispatch) sono pure → test table-driven.
- Lint: ESLint + Prettier (config in root). Niente `any` non giustificato.

### Python (`services/voice-core`, `tools/mcp-screen`)
- Python 3.12, **uv** per dipendenze (`pyproject.toml` + `uv.lock`).
- I modelli evento sono **GENERATI** (Pydantic) da `@contracts` — MAI scriverli a mano.
  Rigenerazione: `make codegen`. Se modifichi `events.ts` senza rigenerare, il contract test fallisce: è voluto.
- Test: pytest. Async: asyncio nativo + `websockets`.
- Type check: mypy strict sui moduli core.

### Contratto (`packages/contracts`)
- Ogni evento ha `type` (discriminante) e `v` (versione, intero).
- Modifiche al contratto = PR dedicata + aggiornamento delle golden fixtures + rigenerazione Pydantic.
- Mai breaking change silenzioso: se cambi un campo, bumpa `v` dell'evento.

## Cosa NON fare (anti-pattern ereditati da Mark-XL, vietati qui)
- ❌ Logica di business nel HUD o in voice-core.
- ❌ Tool hardcoded dentro agent-core (i tool sono MCP server in `tools/`).
- ❌ Auto-install di pacchetti a runtime.
- ❌ Comunicazione diretta voice-core ↔ HUD (tutto passa per agent-core).
- ❌ Schemi evento duplicati a mano in Python.

## Integrazione JARVIS/FRIDAY (sistema esistente)
I persona file Python esistenti (JARVIS voce `am_adam`, FRIDAY voce `af_sky`, con blocchi
`AGENT_INSTRUCTION`/`SESSION_INSTRUCTION`) vengono inglobati come **persona layer in
agent-core**, NON come processi separati. Dettagli e mappatura in
`docs/INTEGRATION-JARVIS-FRIDAY.md`. In sintesi: l'identità (system prompt) vive in
agent-core; la voce (TTS voice id) vive in voice-core; il collegamento è il campo
`persona` negli eventi e `voice` in `tts.speak`.

## Collaborazione con Codex CLI
Questo repo è lavorato in parallelo da Claude Code e Codex CLI. La divisione dei ruoli è
negoziata via stark-forge (vedi `docs/STARK-FORGE-BRIEF.md` per i ruoli seminati).
Regole di convivenza:
- Ognuno lavora SOLO nei path assegnati dal manifest di sessione (`.session/manifest.json` se presente).
- Comunicazione tra agenti: filesystem (file in `.session/notes/`), mai assunzioni implicite.
- Il contratto (`packages/contracts`) è zona condivisa: modifiche SOLO previo accordo
  scritto nel manifest o su richiesta esplicita dell'utente.

## Comandi
```bash
make dev        # avvia agent-core + voice-core (+ hud quando esiste) in parallelo
make test       # vitest + pytest + contract test
make codegen    # Zod → JSON Schema → Pydantic
make lint       # eslint + prettier + mypy + ruff
```

## Definition of Done (per ogni task)
1. Codice + test (unit per la logica, contract se tocchi gli schemi).
2. `make test` e `make lint` verdi in locale.
3. Nessun TODO lasciato senza issue/nota in `.session/notes/`.
4. Commit atomici con messaggio convenzionale.
