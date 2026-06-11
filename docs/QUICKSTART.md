# STARK-AI — Quickstart

Three ways to run the assistant. All of them share the **same brain** (event
hub on `ws://127.0.0.1:7710`) and the **same tool plane** (the core registry:
26 tools — 17 MCP servers + in-process tools including the KDP pipeline).

## Prerequisites (once)

```bash
# 1. Ollama with the local model
ollama pull qwen3:8b

# 2. Kokoro TTS container (port 8880)
docker compose -f docker/docker-compose.yml up -d

# 3. Optional but recommended: API keys
cp .env.example .env   # then fill ANTHROPIC_API_KEY, LiveKit keys, etc.

# 4. Only if the mcp-screen venv is missing
make setup-mcp-screen
```

## Mode 1 — Offline voice (no network required)

```bash
make dev-voice
```

Starts the hub (real brain, all MCP tools) + the offline voice client.
Talk into the microphone; the reply comes back through Kokoro.

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
| Kokoro down | Playback warning, no crash — start the container |
| `mcp-screen` fallback warning | `make setup-mcp-screen` |
| Online modes show only 3 tools | The core (:8787) is not running — check `npm run serve` / `./start.sh` |
