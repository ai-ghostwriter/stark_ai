# Codex Slice 6 - Online convergence

Date: 2026-06-11

## Scope delivered

- Added `packages/core/src/brain/real.ts`.
  - Implements the same event-bus `handle(event, emit)` shape as `FakeBrain`.
  - `stt.final` now routes through `decide()` with `{ online, sensitive: false, personaHints }`.
  - Uses active persona `agentInstruction` as system prompt.
  - Adds `sessionInstruction` only on the first successful model turn as session priming.
  - Preserves in-memory conversation history for the hub lifetime.
  - Persona switch intents are kept exactly aligned with `FakeBrain`: `passa a <persona>` / `switch to <persona>`, `route.info`, and confirmation `tts.speak`.
  - Persona switching does not reset history.

## RealBrain tool-use architecture

- RealBrain has a provider interface:
  - `streamOllama` for local `/api/chat` streaming with registry tool schemas.
  - `streamAnthropic` for Anthropic streaming over Messages SSE with tool schemas converted from the unified registry.
- The unified `Registry` remains the schema source for both in-process tools and MCP tools.
- Tool-use loop:
  - Model emits a tool call.
  - Bus emits `tool.call`.
  - RealBrain dispatches through `Registry`.
  - Bus emits `tool.result`.
  - Tool result is fed back to the model.
  - Loop repeats up to 5 iterations, then final text streams as `agent.token`, followed by `agent.done` and `tts.speak`.
- Failure isolation:
  - Local Ollama transport failure emits a fallback `route.info` to API only when `online=true` and `ANTHROPIC_API_KEY` exists.
  - Otherwise RealBrain emits `sys.error` and an apologetic `tts.speak`.
  - Hub never crashes on model/tool failure.

## Barge-in and history policy

- `barge_in` aborts the active generation through `AbortController`.
- The bus emits `tts.cancel`.
- Truncated turns are dropped from history: the user message and partial assistant text are not appended.
- Rationale: partial text may already have reached HUD as `agent.token`, but it was not committed as an assistant answer and should not bias the next model turn.

## Brain selection

- `STARK_BRAIN=real|fake`.
- Runtime default is `real`.
- Test default is `fake` via `NODE_ENV=test`, so existing hub/FakeBrain tests stay deterministic.

## LiveKit bridge

- Added `packages/voice/hub_bridge.py`.
- `agent.py` modes `ollama` and `claude` now use the core WS hub first:
  - Sends `hello { role: "voice", client: "livekit-agent@0.1" }`.
  - Sends `stt.final` with the LiveKit transcript.
  - Validates inbound events with `contracts_gen.Event`.
  - Waits for `tts.speak` and returns that text into the existing LiveKit/Kokoro TTS path.
- If the hub is unreachable or times out, the bridge logs a warning and falls back to the existing HTTP `/ask` path.
- Gemini and GPT paths were not changed.
- HTTP `/ask` remains fully working for CLI/other consumers.

## mcp-screen fix

- Added root Makefile target `setup-mcp-screen`.
  - Creates `tools/mcp-screen/.venv`.
  - Installs pinned `tools/mcp-screen/requirements.txt`, including official `mcp==1.13.1`.
- `tools/mcp.config.json` now launches mcp-screen via `.venv/bin/python`.
- `tools/mcp-screen/src/server.py` uses the official FastMCP stdio server when the package is available.
- Minimal stdio fallback remains only when `.venv` is missing and prints a clear warning.
- Official SDK verification:
  - MCP client listed `screen_processor`.
  - Hub startup logged `mcp-screen=1` and total `17` tools.

## Smoke evidence

Hub startup:

```text
[mcp] registered 17 tool(s) from 6 server(s): mcp-os=4, mcp-files=2, mcp-web=4, mcp-screen=1, mcp-productivity=3, mcp-dev=3
STARK-AI event hub listening on ws://127.0.0.1:7710 (online=true, brain=real)
```

Plain local turn:

```json
[
  {"type":"route.info","provider":"local","model":"qwen3:8b","reason":"persona prefers local"},
  {"type":"agent.token","delta":"S"},
  {"type":"agent.done"},
  {"type":"tts.speak","text":"Sistemi operativi al 100%, Signore. Sono JARVIS, il sistema di intelligenza artificiale dedicato alla gestione tecnica e all'analisi avanzata per il Signore Stark.","persona":"jarvis"}
]
```

MCP weather tool turn:

```json
[
  {"type":"route.info","provider":"local","model":"qwen3:8b","reason":"persona prefers local"},
  {"type":"tool.call","name":"weather_report","args":{"time":"now","city":"Milano"}},
  {"type":"tool.result","ok":true,"data":{"ok":true,"data":{"city":"Milano","summary":"Milano: 25.6°C, humidity 88%, wind 16.6 km/h"}}},
  {"type":"agent.done"},
  {"type":"tts.speak","text":"A Milano fa 25.6°C, umidità al 88% e vento di 16.6 km/h. Piena freschezza, Signore.","persona":"jarvis"}
]
```

Barge-in:

```json
[
  {"type":"route.info","provider":"local","model":"qwen3:8b","reason":"persona prefers local"},
  {"type":"agent.token","delta":"1"},
  {"type":"agent.token","delta":" "},
  {"type":"barge_in"},
  {"type":"tts.cancel"}
]
```

HTTP `/ask` still works:

```json
{"route":"local","model":"qwen3:8b","tool":null,"reply":"Ok."}
```

## Verification summary

- `packages/core`: `npm test` -> 32 files, 144 tests passed.
- `packages/core`: `npm run typecheck` -> passed.
- `packages/contracts`: `npm test` -> 2 files, 27 tests passed.
- `tools/*`: `make test-mcp-tools` -> all TS MCP suites plus mcp-screen pytest passed.
- `packages/voice`: `./.venv/bin/pytest -q` -> 53 passed.
- `packages/ui`: `npm run build` -> passed; Vite reported only the existing large chunk warning.

## Open points

- Full real LiveKit browser e2e still needs the LiveKit/Kokoro/docker stack running and is out of headless scope for this slice.
- Anthropic streaming/tool-use adapter is implemented, but the smoke environment had no `ANTHROPIC_API_KEY`; only local Ollama path was smoke-tested live.
- The official Python MCP SDK prints a shutdown traceback when the parent stdio process is interrupted by Ctrl-C during smoke shutdown. Startup and tool listing are correct; graceful shutdown polish can be handled separately.
