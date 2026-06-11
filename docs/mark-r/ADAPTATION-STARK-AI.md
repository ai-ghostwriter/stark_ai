# ADAPTATION-STARK-AI.md — Integrazione MARK-R dentro STARK-AI (Opzione A)

> Documento di adattamento, deciso l'11/06/2026. I documenti MARK-R in questa cartella
> sono stati scritti per un repo greenfield (`mkdir mark-r`): NON vanno seguiti alla
> lettera. Questo file è la lente di lettura: dice cosa si adotta, cosa si scarta e come
> i nomi/concetti MARK-R si mappano sull'esistente. In caso di conflitto tra questo file
> e gli altri doc della cartella, vince questo file.

## Decisione

**Opzione A — adattare MARK-R a STARK-AI**, non ricostruire da zero.
STARK-AI implementa già gran parte della visione MARK-R (cervello TS con router
tier-based, voce Python, UI React). Si adottano i pezzi mancanti di valore:

1. **Il contratto tipizzato** (`packages/contracts`, Zod → Pydantic, golden fixtures,
   contract test in CI) — oggi il confine TS↔Python è HTTP non tipizzato, è il punto
   debole del sistema.
2. **Il percorso voce offline** (topologia MARK-R: voice-core possiede il microfono,
   sul confine passano solo eventi semantici).
3. **La decomposizione personas** (identità in core, voce in voice — vedi
   `INTEGRATION-JARVIS-FRIDAY.md`, che si applica quasi verbatim).
4. **I tool come server MCP** (con le `actions/` di Mark-XL come catalogo di partenza,
   vedi `reference/mark-xl/`).

## Vincolo architetturale: dual-mode offline/online

Il progetto deve girare in locale sia offline che online. **LiveKit resta, ma solo come
trasporto del percorso online.** L'offline non dipende da LiveKit né da Docker.

| | Percorso ONLINE (esistente) | Percorso OFFLINE (nuovo, da MARK-R) |
|---|---|---|
| Front-door audio | Browser → LiveKit room → `agent.py` | `voice-core` cattura mic/speaker direttamente (stile Mark-XL) |
| STT/TTS | Pipeline LiveKit Agents / Gemini realtime | Whisper locale + Kokoro locale, interni a voice-core |
| Confine verso il core | HTTP bridge (oggi) → eventi contratto (target) | WS event bus (hub nel core, porta 7710) |
| LLM | Ollama o Anthropic via router | Solo Ollama (regola forte `!online → local` di `route()`) |
| UI | `packages/ui` via LiveKit | `packages/ui` come client WS del hub (transcript/log) |

Regola suprema MARK-R confermata per il percorso offline: **i byte audio non
attraversano mai il confine di linguaggio** — sul WS passano solo eventi
(`stt.final`, `tts.speak`, `barge_in`, …). Entrambi i percorsi parlano lo **stesso
contratto** `@contracts`: il core non sa e non deve sapere da quale front-door arriva
un `stt.final`.

## Mappatura nomi MARK-R → STARK-AI

| Nei doc MARK-R | In STARK-AI | Note |
|---|---|---|
| `mark-r/` (repo nuovo) | questo repo | Niente `git init`, niente setup §"Setup del repo" di OVERVIEW.md |
| `packages/agent-core` | `packages/core` | Il cervello esiste già; si estende (WS hub, personas registry), non si ricrea |
| `packages/hud` | `packages/ui` | Niente Tauri per ora; la UI esistente acquisisce la vista WS offline |
| `services/voice-core` | `packages/voice` | `agent.py` (LiveKit) resta; si aggiunge l'entrypoint offline |
| `packages/contracts` | `packages/contracts` | **Da creare** — unico pezzo nuovo di struttura |
| FakeBrain / FakeVoice | utili solo come stub di test del bus | Non sostituiscono il core/voce reali |
| `route()` (provider local/cloud) | tier routing esistente in core | Si unificano: regole forti (offline/sensitive) + tier Haiku/Sonnet/Opus + `routingHints` persona |
| Branch flow `development → uat → main` | flusso attuale del repo (main) | NON adottato per ora |
| pnpm workspaces con root package.json | package per-cartella attuale | Da valutare solo se/quando serve davvero |
| uv per Python | venv attuale in `packages/voice` | Da valutare a parte, non vincolante |

## Documenti della cartella: come leggerli

- `ARCHITECTURE.md` — valido per concetti e ADR (contratto, MCP, router ibrido,
  failure isolation). Struttura monorepo §8 e roadmap §9: sostituite da questo file.
- `SLICE-0-SPEC.md` — il contratto §3, il codegen §4 e le golden fixtures §5 sono
  riferimento normativo. La topologia §2 e le implementazioni §6 vanno rilette con la
  mappatura sopra (hub dentro `packages/core`, stub solo per test).
- `INTEGRATION-JARVIS-FRIDAY.md` — si applica quasi verbatim: i persona file con
  `AGENT_INSTRUCTION`/`SESSION_INSTRUCTION` esistono in `packages/voice/personas/`
  (`jarvis.py`, `friday.py`). Unica differenza: il registry personas vive in
  `packages/core`, la mappa voci in `packages/voice`.
- `STARK-FORGE-BRIEF.md` — seme di negoziazione ruoli Claude/Codex: valido come
  metodo, ma le aree vanno riformulate sugli slice adattati qui sotto.
- `CLAUDE-MARK-R.md` / `AGENTS-MARK-R.md` — NON sono in root di proposito: le loro
  convenzioni (contratto a modifica concordata, codegen obbligatorio, divisione ruoli)
  verranno fuse nei CLAUDE.md/AGENTS.md del repo quando partono gli slice.
- `OVERVIEW.md` — indice storico del pacchetto; i prompt di avvio che contiene vanno
  aggiornati a questo piano prima dell'uso.

## Roadmap adattata (slice verticali)

1. **Slice 0 — Contratto**: creare `packages/contracts` (eventi Zod di SLICE-0-SPEC §3
   incluso `persona`, + schema `PersonaProfile`), golden fixtures, codegen Pydantic
   verso `packages/voice`, contract test su entrambi i lati. Nessun cambio di
   comportamento runtime: solo il lucchetto anti-deriva.
2. **Slice 1 — Bus offline con eventi finti**: WS hub in `packages/core` (:7710),
   stub FakeVoice da stdin, vista transcript nella UI via WS. Dimostra il confine
   senza audio reale.
3. **Slice 2 — Voce offline reale**: entrypoint offline in `packages/voice`
   (VAD + Whisper locale + Kokoro, barge-in), mic/speaker interni al processo.
   L'assistente funziona senza rete, senza Docker, senza LiveKit.
4. **Slice 3 — Personas decomposte**: profili JSON + registry in core, mappa voci in
   voice, switch a runtime. Vale per entrambi i percorsi (LiveKit e offline).
5. **Slice 4 — Router unificato**: `route()` pura con regole forti
   (offline/sensitive → locale), classificazione task, tier Anthropic esistente e
   `routingHints` persona; `route.info` visibile in UI.
6. **Slice 5 — Tool MCP**: estrarre i tool dal core come server MCP; cherry-pick dal
   catalogo Mark-XL (`reference/mark-xl/actions/`): browser control, file management,
   screen analysis, ecc.
7. **Slice 6 — Convergenza online**: il bridge HTTP di `agent.py` migra agli eventi
   del contratto, così LiveKit e offline diventano due front-door dello stesso bus.

## Cosa NON si fa

- ❌ Ricostruire agent-core/hud/voice-core da zero in parallelo all'esistente (Opzione B, scartata).
- ❌ Sostituire LiveKit con il WS bus per il percorso online.
- ❌ Copiare codice di Mark-XL dentro i package: `reference/mark-xl/` è sola consultazione
  (anti-pattern documentati in ARCHITECTURE.md §0 — monolite, tool hardcoded, auto-install).
- ❌ Adottare branch flow / pnpm root / uv solo perché lo dicono i doc greenfield.
