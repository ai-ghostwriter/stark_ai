🇬🇧 English | [🇮🇹 Italiano](README.it.md)

# STARK-AI

STARK-AI is a local/cloud AI voice assistant in Iron Man style. The project combines a React UI with LiveKit, a Python voice layer, and a Node/TypeScript core that acts as the operational "brain" for LLM routing, session memory, an event bus, and tools.

The two main personas are:

- **JARVIS**: formal, technical, precise, oriented toward engineering analysis, debugging, architectures, and structured decisions.
- **FRIDAY**: concise, critical, direct, with unfiltered judgment and a personal-assistant tone.

The system allows selecting the runtime mode from the UI among `gemini`, `ollama`, `claude`, and `gpt`. The selected mode is saved in memory in the token server and read by the voice agent when it is dispatched into the LiveKit room.

## What STARK-AI Actually Does

In practice, STARK-AI is a **personal voice assistant you talk to from the browser**, built around three ideas: local-first economics, real task execution, and a production brain for a self-publishing business.

**You speak, it answers — with a personality.** Open the HUD-style dashboard, talk into the microphone, and the assistant listens, thinks, and replies with a synthesized voice. Say `JARVIS` as your first word and you get the formal engineer; anything else and FRIDAY, the blunt personal assistant, takes the call. Persona and LLM backend can also be switched live from the UI without restarting anything.

**Local-first, cloud when it counts.** The Node core routes every request by weight and context: everyday/offline requests go to a local Ollama model (free, private, works offline), while heavy online work — long inputs, manuscript writing, strategic briefs — can be escalated to the Anthropic API, picking the cheapest adequate tier (Haiku for classification/extraction, Sonnet for writing/analysis, Opus for manuscript- and strategy-grade tasks). Speech synthesis runs on local Kokoro in the voice layer, so in local/offline mode your voice never leaves the machine. The result: an always-on assistant whose marginal cost is near zero, spending API money only where quality demands it.

**It executes, not just chats.** Through one unified tool registry the assistant can call in-process tools and MCP tools for weather, web/search/browser helpers, productivity actions, files, screen capture/analysis, local OS actions, dev helpers, KDP workflow state, and knowledge-base search — by voice, end to end.

**It runs a real publishing operation.** The core embeds the operational brain of an Amazon KDP book-production pipeline: it can scaffold a new book project (`newBook`), ingest Helium10 Cerebro keyword research (`ingestCerebro`), report production status (`bookStatus`), and execute workflow phases (`runPhase`). A local semantic knowledge base (`kbIndex`/`kbSearch`, embeddings via `bge-m3`) acts as cross-book brand memory. In concrete terms: you can ask out loud *"where is the book at?"* and get an answer computed from the actual production state on disk.

A typical online round trip: the browser captures your voice → LiveKit streams it to the Python agent → STT transcribes it → the agent sends `stt.final` to the core WebSocket bus → the real brain routes it (Ollama or Anthropic), streams tokens, and may invoke MCP/in-process tools → the bus emits `tts.speak` → Kokoro speaks it in the persona's voice. The offline voice client uses the same bus contract without LiveKit or Docker LiveKit.

## Monorepo Architecture

The repository has a small root `package.json` for shared dev helpers; runtime Node packages are managed inside `packages/core`, `packages/contracts`, `packages/ui`, and `tools/mcp-*`, while the voice component is Python.

```text
STARK-AI/
├── .env.example
├── start.sh
├── docker/
│   ├── docker-compose.yml
│   └── livekit/
│       └── livekit.yaml
├── docs/
│   ├── superpowers/
│   └── jarvis-original/
└── packages/
    ├── core/
    ├── ui/
    └── voice/
```

### Runtime Flow

```text
Browser React UI
  └─ GET /token, GET/POST /mode, GET/POST /persona
     via Vite proxy to FastAPI Token Server :8788
        ├─ generates LiveKit token
        ├─ dispatches the voice agent into the room
        └─ keeps current mode/persona in memory

LiveKit Room
  └─ Voice Agent Python
     ├─ Gemini realtime if mode=gemini
     ├─ STT/LLM/TTS pipeline if mode=gpt
     └─ WS event bridge to Core Hub :7710 if mode=ollama or mode=claude
        └─ falls back to Core HTTP /ask if the hub is unavailable

Offline Voice Client
  └─ Whisper/Kokoro voice loop
     └─ same WS event contract to Core Hub :7710

Core Node
  ├─ WS Hub :7710
  │  ├─ RealBrain by default (STARK_BRAIN=real)
  │  └─ FakeBrain for tests/demos (STARK_BRAIN=fake)
  └─ HTTP :8787
     ├─ POST /ask
     ├─ POST /translate
     ├─ POST /speak
     ├─ GET /health
     └─ GET /stats
```

## Main Packages

### `packages/ui`

React/Vite frontend for the voice dashboard. It uses:

- `react` and `react-dom`
- `@livekit/components-react`
- `livekit-client`
- `sass`
- Vite with local proxy to `http://localhost:8788`

Relevant files:

- `src/App.tsx`: requests the LiveKit token from `/token`, opens `LiveKitRoom`, and shows the boot/error screen and main shell.
- `src/components/Header/Header.tsx`: shows the current persona, voice agent status, clock, and the `FRIDAY/JARVIS` and `GEMINI/OLLAMA/CLAUDE/GPT` selectors.
- `vite.config.ts`: exposes the UI on port `5173` and proxies `/token`, `/mode`, `/persona` to the token server.

### `packages/voice`

Python layer for LiveKit Agents, token server, and personas.

Relevant files:

- `agent.py`: LiveKit agent entrypoint. Reads mode/persona from the token server, starts Gemini realtime, GPT STT/LLM/TTS, or the core WS bridge for `ollama`/`claude`.
- `hub_bridge.py`: typed WebSocket bridge to the core event bus with HTTP `/ask` fallback.
- `offline_voice/*`: real offline front-door using local VAD/STT/TTS and the same WS event contract.
- `token_server.py`: FastAPI server on port `8788`; generates LiveKit tokens, dispatches the agent, and manages `mode`/`persona`.
- `tts_kokoro.py`: OpenAI-compatible TTS adapter to local Kokoro (`KOKORO_URL`).
- `tools.py`: direct LiveKit tools used by Gemini/GPT paths; `ollama`/`claude` use the core unified registry instead.
- `personas/jarvis.py`: prompt, session instruction, and Kokoro voice for JARVIS.
- `personas/friday.py`: prompt, session instruction, and Kokoro voice for FRIDAY.
- `personas/detect.py`: minimal detection: if the user's first word is `JARVIS`, selects JARVIS; otherwise FRIDAY.

### `packages/core`

Node/TypeScript core of the JARVIS brain.

Main responsibilities:

- HTTP server on port `8787`;
- WebSocket event hub on port `7710`;
- real bus brain with streaming LLM and true tool-use loop;
- conversation/session orchestration;
- local/API routing;
- unified in-process + MCP tool registry;
- local Ollama integration;
- Anthropic API integration;
- utility endpoints for translation, macOS system speak, health, and stats.

Relevant files:

- `src/server.ts`: creates the HTTP server and registers endpoints `/ask`, `/translate`, `/speak`, `/health`, `/stats`.
- `src/bus/index.ts`: starts the WS hub and selects `RealBrain`/`FakeBrain` through `STARK_BRAIN`.
- `src/brain/real.ts`: event-bus brain with persona prompts, streaming providers, tool loop, fallback, and barge-in cancellation.
- `src/config.ts`: loads models, Ollama URL, routing thresholds, and session path.
- `src/core/router.ts`: decides `local` vs `api`.
- `src/core/tier.ts`: chooses API tier `haiku`, `sonnet`, `opus`.
- `src/core/orchestrator.ts`: builds messages, calls Ollama or Anthropic, and handles local tool calls.
- `src/llm/ollama.ts`: `/api/chat` client for Ollama.
- `src/llm/anthropic.ts`: Anthropic Messages API client.
- `src/tools/builtins/*`: local tools registered in the core, including time, weather, file read, KDP/book workflow, and knowledge base.
- `src/tools/mcp/*` and `tools/mcp-*`: MCP client/runtime and external tool servers for OS, files, web, screen, productivity, and dev helpers.

## Technology Stack

### Frontend

- React 18
- TypeScript
- Vite
- Sass modules
- LiveKit React Components

### Backend/Core

- Node.js
- TypeScript
- Native Node HTTP server
- Anthropic SDK
- Vitest for core tests

### Voice/AI

- Python
- FastAPI + Uvicorn
- LiveKit Agents
- LiveKit API
- LiveKit plugins: OpenAI, Google, Anthropic, Silero, noise cancellation
- OpenAI STT in the non-Gemini pipeline
- Google Gemini Realtime in `gemini` mode
- Kokoro FastAPI as local OpenAI-compatible TTS
- Ollama as the core local LLM
- Anthropic as LLM API for heavy tasks in the core

### Local Infra

- Docker Compose for Kokoro TTS
- Local LiveKit config in `docker/livekit/livekit.yaml`
- Orchestrator script `start.sh`
- `.env` file loaded by Python and Bash

## Configuration

1. Copy the env file:

```bash
cp .env.example .env
```

2. Fill in the required variables in `.env`.

Variables present in `.env.example`:

```bash
LIVEKIT_URL=ws://localhost:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=devsecret

GOOGLE_APPLICATION_CREDENTIALS=
OPENAI_API_KEY=

ANTHROPIC_API_KEY=
GOOGLE_GENAI_API_KEY=

JARVIS_URL=http://localhost:8787
KOKORO_URL=http://localhost:8880/v1
TOKEN_SERVER_URL=http://localhost:8788

OLLAMA_MODEL=qwen3:8b
```

Important notes:

- `start.sh` exports `JARVIS_MODEL_LOCAL` using `OLLAMA_MODEL` if `JARVIS_MODEL_LOCAL` is not already set.
- The core also uses defaults not present in `.env.example`: `OLLAMA_URL=http://localhost:11434`, `JARVIS_MODEL_API=claude-sonnet-4-6`, `JARVIS_MODEL_API_HAIKU=claude-haiku-4-5-20251001`, `JARVIS_MODEL_API_OPUS=claude-opus-4-8`, `JARVIS_EMBED_MODEL=bge-m3`.
- For `mode=claude` in the voice agent, the request still goes through the Node core; in the core, API routing uses Anthropic when the request is classified as heavy or forced via internal context.
- For `mode=gpt`, the voice agent directly uses `openai.LLM(model="gpt-4o-mini")`.
- For `mode=gemini`, the voice agent uses `google.beta.realtime.RealtimeModel`.
- `docker/docker-compose.yml` starts only Kokoro TTS. It does not start LiveKit.
- `docker/livekit/livekit.yaml` contains a local LiveKit configuration with port `7880`, key `devkey`, and secret `devsecret`, but it is not connected to the current compose file.

## Dependency Setup

Install the Node dependencies of the two packages:

```bash
cd packages/core
npm install

cd ../ui
npm install
```

The Python virtualenv for `packages/voice` is created automatically by `start.sh` if missing:

```bash
python3 -m venv packages/voice/.venv
packages/voice/.venv/bin/python -m pip install -r packages/voice/requirements.txt
```

Normally you do not need to run these two commands manually, except for manual setup or debugging.

Also make sure Docker is running and, if you use Ollama:

```bash
ollama serve
ollama pull qwen3:8b
```

If you also use the core embeddings/KD knowledge base, prepare the model configured in `JARVIS_EMBED_MODEL` (default `bge-m3`).

## Step-by-Step Local Startup

### Full Startup With Script

From the project root:

```bash
./start.sh
```

The script performs these operations:

1. checks that `.env` exists;
2. loads environment variables;
3. creates `packages/voice/.venv` if absent;
4. installs `packages/voice/requirements.txt` if the venv is created;
5. starts Docker Compose for Kokoro TTS;
6. starts the Node core on `http://localhost:8787`;
7. starts the token server on `http://localhost:8788`;
8. starts the LiveKit voice agent;
9. starts the Vite UI on `http://localhost:5173`.

Expected endpoints/services:

```text
UI:            http://localhost:5173
Token server:  http://localhost:8788
Core Node:     http://localhost:8787
Kokoro TTS:    http://localhost:8880
LiveKit:       configured by LIVEKIT_URL
```

To stop everything:

```text
CTRL+C
```

The `start.sh` trap terminates child processes and stops the Kokoro compose with:

```bash
docker compose -f docker/docker-compose.yml down
```

### Manual Startup

Useful for debugging individual layers.

Terminal 1, Kokoro:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Terminal 2, Core Node:

```bash
cd packages/core
npm run serve
```

Terminal 3, token server:

```bash
cd packages/voice
.venv/bin/python token_server.py
```

Terminal 4, voice agent:

```bash
cd packages/voice
.venv/bin/python agent.py dev
```

Terminal 5, UI:

```bash
cd packages/ui
npm run dev -- --port 5173
```

## AI Modes and Routing

### Voice Agent Modes

The token server keeps `_current_mode`, initially `gemini`. The UI reads and changes this mode through:

- `GET /mode`
- `POST /mode` with `{ "mode": "gemini" | "ollama" | "claude" | "gpt" }`

The voice agent reads the mode with `GET {TOKEN_SERVER_URL}/mode` and normalizes the allowed values:

```text
gemini | ollama | claude | gpt
```

Actual behavior in `packages/voice/agent.py`:

- `gemini`: starts a Gemini realtime session with voice `Fenrir` for JARVIS and `Aoede` for FRIDAY; on timeout or error it falls back to the `gpt` pipeline.
- `gpt`: uses the LiveKit pipeline with OpenAI STT, Silero VAD, OpenAI LLM `gpt-4o-mini`, and Kokoro TTS.
- `ollama`: uses the STT/VAD/TTS pipeline, but the LLM is `JarvisLLM`, a WS event bridge to the core hub with HTTP `/ask` fallback.
- `claude`: in the voice agent, uses the same `JarvisLLM` bridge to the core; the actual choice between Ollama and Anthropic happens in the Node core router.

### Routing in the Node Core

The core decides between:

- `local`: Ollama, model `JARVIS_MODEL_LOCAL` or default `qwen3:8b`;
- `api`: Anthropic, tier `haiku`, `sonnet`, or `opus`.

Main rules in `src/core/router.ts`:

- explicit override `local` or `api` if passed in the internal context;
- API if `ctx.heavy` is true;
- API if input exceeds `JARVIS_HEAVY_CHARS` (default `4000`);
- API if the input contains heavy patterns such as `scrivi il capitolo`, `scrivi il libro`, `manoscritto`, `brief strategico`, `outline completo`;
- otherwise local default via Ollama.

API tiers in `src/core/tier.ts`:

- `haiku`: extraction, classification, summary, translation;
- `sonnet`: writing, analysis, copy;
- `opus`: manuscript, strategy, and opus-grade patterns.

## JARVIS/FRIDAY Personas

The current persona is kept by the token server, initially `friday`.

Endpoints:

- `GET /persona`
- `POST /persona` with `{ "persona": "jarvis" | "friday" }`

The UI allows manual selection from the Header. The voice agent can also detect the persona from the first user turn:

- if the first word is `JARVIS`, sets `jarvis`;
- in all other cases sets `friday`.

Configured Kokoro voices:

```text
JARVIS -> am_adam
FRIDAY -> af_sky
```

In Gemini realtime mode, instead, the configured voices are:

```text
JARVIS -> Fenrir
FRIDAY -> Aoede
```

## Available Tools

### Voice Agent Tools

Defined in `packages/voice/tools.py`:

- `get_weather(city)`: weather from `wttr.in`;
- `search_web(query)`: DuckDuckGo search via LangChain community tool;
- `send_email(to_email, subject, message, cc_email?)`: send through Gmail SMTP using `GMAIL_USER` and `GMAIL_APP_PASSWORD`.

These Gmail variables are not present in `.env.example`, so they must be added manually if you want to use `send_email`.

### Node Core Tools

Registered in `packages/core/src/server.ts`:

- `time`
- `weather`
- `readFile`
- `ingestCerebro`
- `bookStatus`
- `runPhase`
- `newBook`
- `kbIndex`
- `kbSearch`

They are exposed to the local Ollama model through tool calling in the core registry.

## Tests and Checks

Core Node:

```bash
cd packages/core
npm test
npm run typecheck
```

UI:

```bash
cd packages/ui
npm run build
```

Voice Python:

```bash
cd packages/voice
.venv/bin/python -m pytest
```

Core health check:

```bash
curl http://localhost:8787/health
```

Core stats:

```bash
curl http://localhost:8787/stats
```

Token server mode/persona:

```bash
curl http://localhost:8788/mode
curl http://localhost:8788/persona
```

## Operational Notes

- `.env` is ignored by Git; use `.env.example` as a template.
- `node_modules`, `.venv`, `dist`, `__pycache__`, and `.jarvis` are ignored.
- The core default session file is `.jarvis/session.json` inside the working directory of the `packages/core` process.
- `POST /speak` in the core uses the macOS `say` command; on non-macOS systems it returns an error.
- `start.sh` assumes that `npm install` has already been run in `packages/core` and `packages/ui`.
- If `LIVEKIT_URL` points to a LiveKit cloud, matching cloud key and secret are required. If it points to `ws://localhost:7880`, a local LiveKit server must be started separately with a configuration compatible with `docker/livekit/livekit.yaml`.
