# STARK-AI — Quickstart

Three ways to run the assistant. All of them share the **same brain** (event
hub on `ws://127.0.0.1:7710`) and the **same tool plane** (the core registry:
26 tools — 17 MCP servers + in-process tools including the KDP pipeline).

## Prerequisites (once)

```bash
# 1. Ollama with the local model
ollama pull qwen3:8b

# 2. Optional but recommended: API keys
cp .env.example .env   # then fill ANTHROPIC_API_KEY, LiveKit keys, etc.

# 3. Only if the mcp-screen venv is missing
make setup-mcp-screen
```

## Mode 1 — Offline voice (no network required)

```bash
make dev-voice
```

Starts the hub (real brain, all MCP tools) + the offline voice client.
`make dev-voice` starts Kokoro TTS automatically through Docker when port 8880
is not already ready. Talk into the microphone; the reply comes back through Kokoro.

Things to try by voice:
- `"passa a friday"` / `"switch to jarvis"` / `"passa a veronica"` / `"passa a war machine"` — persona switch with voice change
- `"che tempo fa a Milano?"` — the model picks the weather tool by itself
- `"apri Calculator"` — OS control via MCP
- `"cerca ricette per diabetici"` — web search, spoken results
- speak over a reply to interrupt it (barge-in)

Wake words at the start of an utterance also select the persona in the
LiveKit modes: `JARVIS …`, `VERONICA …`, `WAR MACHINE …` (anything else is FRIDAY).

## Mode 2 — Text debug (no microphone)

```bash
make dev-offline
```

Type phrases instead of speaking (`!barge` interrupts). In a second terminal:

```bash
cd packages/ui && npm run dev
```

Open `http://localhost:5173` and press **Offline Debug**: live transcript,
`[route]` lines showing router decisions, raw event log.

## Mode 3 — Full online UI (browser + LiveKit)

```bash
./start.sh
```

Boots: Kokoro (Docker), Core HTTP (:8787), **event hub WS (:7710, real
brain)**, token server (:8788), LiveKit voice agent, UI (:5173).

Open `http://localhost:5173` — persona and mode selectors in the header:
- **GEMINI / GPT**: the LLM runs inside LiveKit, but its function tools are
  loaded dynamically from the core (`GET /tools`) — the full 26-tool fleet,
  uniform with every other mode. If the core is down, the agent degrades to
  the 3 legacy tools with a warning.
- **OLLAMA / CLAUDE**: the agent bridges to the event hub (same brain as the
  offline mode); HTTP `/ask` remains as fallback.

### Pannelli HUD (render events)

Ogni risposta dei 5 tool dati viaggia su due binari dalla stessa tool call: la voce
dice il sommario, il centro della HUD anima il pannello (`render.event` sul bus :7710,
contratto in `packages/contracts/src/render.ts`).

| Chiedi... | Tool | Pannello |
|---|---|---|
| "fammi il brief" | `get_daily_brief` | Brief card (type-in + chips) |
| "come vanno le vendite / KENP / recensioni" | `query_metrics` | Line chart che si disegna |
| "cosa c'è in pipeline / a rischio" | `get_pipeline` | Funnel + progetti a rischio in rosso |
| "cosa è stato detto su X" | `search_intel` | Timeline note |
| "su cosa lavoro oggi" | `plan_my_day` | Action list prioritizzata |

`STARK_DEMO_MODE=1` (default da `./start.sh`): dati da `seed/*.json`, fittizi e stabili.
`STARK_DEMO_MODE=0`: sorgenti live quando esisteranno gli adapter; oggi ricade sul seed,
il pannello non è mai vuoto. Script demo: `seed/DEMO_RUNBOOK.md`.

## The tool plane over HTTP

```bash
curl http://localhost:8787/tools                 # list all tool schemas
curl -X POST http://localhost:8787/tools/call \
  -H "Content-Type: application/json" \
  -d '{"name":"weather_report","args":{"city":"Milano"}}'
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Port 7710 busy | `pkill -f "bus/index"` and relaunch |
| Ollama down | Router falls back to the Anthropic API if `ANTHROPIC_API_KEY` is set; otherwise a polite error reply |
| Kokoro down | `make dev-voice` tries to start the Kokoro container; if Docker is unavailable, replies stay silent |
| `🎤 In ascolto...` repeats or triggers on room noise | Tune VAD with `OFFLINE_VOICE_VAD_AGGRESSIVENESS=2`, `OFFLINE_VOICE_SPEECH_START_MS=200`, `OFFLINE_VOICE_SPEECH_END_MS=700` |
| Assistant voice is captured from speakers | Normal capture is blocked while speaking; barge-in requires `OFFLINE_VOICE_BARGE_MS=400`, then capture reopens after `OFFLINE_VOICE_REFRACTORY_MS=300` |
| Whisper returns short garbage like `You` / `Thank you` | Segments shorter than `OFFLINE_VOICE_MIN_SPEECH_S=0.4` and known noise transcripts are discarded with a visible status line |
| Whisper guesses the wrong language | Set `WHISPER_LANGUAGE=it` (or `en`, `de`, `fr`) to pin faster-whisper instead of auto-detecting |
| `mcp-screen` fallback warning | `make setup-mcp-screen` |
| Online modes show only 3 tools | The core (:8787) is not running — check `npm run serve` / `./start.sh` |
