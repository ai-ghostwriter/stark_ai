# STARK-AI

STARK-AI is a voice-first agentic platform for coordinating AI assistants, local tools and controlled development workflows. The current state of the project revolves around **FRIDAY** as a voice planner/orchestrator: from the UI and voice it can generate operational runs, pass through a human approval gate and execute a local `Claude Architect -> Codex Implementer -> Claude Reviewer` chain.

The repository is a modular monorepo with Node/TypeScript packages, a Python voice layer, a React dashboard and a suite of local MCP servers. The `FRIDAY_MASTER_SPEC.md` file remains the long-term architectural contract; the current code already implements a first real version of the FRIDAY planner, not yet the entire multi-agent operating system described in the vision.

## High-level architecture

```text
Browser / Dashboard React
  -> Token server Python
  -> LiveKit room / Voice agent Python
  -> Core Node HTTP + WebSocket hub
  -> Registry tool in-process + server MCP
  -> Workflow FRIDAY
       -> Claude Architect
       -> human approval gate
       -> Codex Implementer
       -> git diff
       -> Claude Reviewer
```

### Agentic roles

**FRIDAY** is the most concrete role in the current code. It exists as a persona (`packages/core/personas/profiles/friday.json`) and as a workflow executor (`packages/core/src/workflows/*`). Its operational task is to generate plans, start runs, wait for approval, delegate implementation and publish state/logs to the UI and event bus.

**JARVIS** exists as a technical persona (`packages/core/personas/profiles/jarvis.json` and linked Python profiles). In the current product it is used as a technical analysis and interaction profile, not as a separate executor.

**VERONICA** exists as a persona profile (`packages/core/personas/profiles/veronica.json` and `packages/voice/personas/veronica.py`) for long and massive tasks. In the current code it does not yet have a dedicated executor pipeline: it is a direction consistent with the roadmap, but the real orchestration implemented today is FRIDAY.

Profiles such as **WAR-MACHINE** are also present for KDP workflows, but this README documents the project's general runtime.

## Main components

### `packages/core`

Node/TypeScript core. Contains:

- HTTP server on port `8787`;
- WebSocket event hub on port `7710`;
- local/API LLM routing;
- in-process tool registry and MCP loading;
- workspace policy and command execution;
- FRIDAY JSONL logging;
- FRIDAY workflow with run state, approval gate, Claude/Codex/Git runner;
- `/workflow`, `/workflow/run`, `/workflow/run/:id`, `/workflow/run/:id/approve|reject` endpoints;
- voice tools `friday_run`, `friday_run_status`, `friday_approve`.

Declared scripts:

- `npm run serve`: core HTTP server;
- `npm run dev:hub`: WebSocket event hub;
- `npm test`: Vitest tests;
- `npm run typecheck`: TypeScript check.

These scripts are documented for maintenance and testing. To start the full project, use only `./start.sh`.

### `packages/ui`

React/Vite dashboard with LiveKit. Contains the AppShell HUD, status panels, transcript/event log and `WorkflowPanel`, which today can:

- create FRIDAY `analysis`, `implementation` or `review` runs;
- indicate a workspace under `workspaces/`;
- poll run state;
- approve or reject a pending run.

### `packages/voice`

Python layer for voice interaction:

- `agent.py`: LiveKit voice agent;
- `token_server.py`: token server and mode/persona state;
- `hub_bridge.py`: bridge to the core bus;
- `offline_voice/`: offline voice client;
- `personas/`: voice/persona profiles;
- `contracts_gen/`: Pydantic models generated from TypeScript contracts.

The `packages/voice/.venv` virtualenv is created automatically by `start.sh` if missing.

### `packages/contracts`

Shared TypeScript package for contracts and schema:

- Zod definitions;
- JSON Schema generation;
- compatibility tests;
- source for the Python models generated in `packages/voice/contracts_gen`.

### `tools`

Suite of local MCP servers loaded by the core through `tools/mcp.config.json`:

- `mcp-os`: local OS actions;
- `mcp-files`: file operations;
- `mcp-web`: browser/search/web helper;
- `mcp-screen`: screen capture and analysis in Python;
- `mcp-productivity`: productivity, reminders, weather, messages;
- `mcp-dev`: development helper.

The `Makefile` exposes `test-mcp-tools` and `setup-mcp-screen` for testing/setup of these servers.

### `prompts`

Operational prompts for the FRIDAY roles:

- `architect.md`;
- `implementer.md`;
- `reviewer.md`.

The code also uses TypeScript versions in `packages/core/src/workflows/fridayPrompts.ts`.

### `docker`

Contains the local configuration for external services:

- `docker/docker-compose.yml`: starts Kokoro TTS on port `8880`;
- `docker/livekit/livekit.yaml`: local LiveKit configuration, not started by the current compose.

### `seed`

Demo data and operational fixtures for AIOS/KDP panels:

- `actions.json`;
- `daily_brief.json`;
- `intel.json`;
- `metrics.json`;
- `pipeline.json`;
- `DEMO_RUNBOOK.md`.

## Single entrypoint

To start STARK-AI use only:

```bash
./start.sh
```

`start.sh` exposes no flags. It runs in sequence:

1. checks that `.env` exists;
2. loads environment variables from `.env`;
3. sets runtime defaults (`JARVIS_PORT`, `JARVIS_MODEL_LOCAL`, `JARVIS_URL`, `KOKORO_URL`, `TOKEN_SERVER_URL`, `STARK_DEMO_MODE`);
4. creates `packages/voice/.venv` if missing;
5. installs `packages/voice/requirements.txt` into the newly created virtualenv;
6. starts Docker Compose for Kokoro TTS;
7. starts the Node Core on `http://localhost:8787`;
8. starts the WebSocket Event Hub on `ws://127.0.0.1:7710` with `STARK_BRAIN=real` by default;
9. starts the Python Token Server on `http://localhost:8788`;
10. starts the LiveKit Voice Agent;
11. starts the Vite UI on `http://localhost:5173`.

When it receives `CTRL+C`, the script terminates child processes, cleans up any remaining LiveKit subprocesses and stops the Docker compose.

## Requirements

### Runtime

- macOS or Unix-like environment with Bash;
- Node.js compatible with the current dependencies. The root dependency `concurrently@9.2.1` requires Node `>=18`;
- npm installed;
- Python 3 with `venv` support;
- Docker active for Kokoro TTS;
- access to the `claude` and `codex` CLIs if you want to use real FRIDAY execution;
- LiveKit reachable through `LIVEKIT_URL`;
- Ollama available if local routing is used;
- API keys consistent with the enabled modes.

### Environment variables

Create `.env` from `.env.example`. The variables present in the template are:

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

`start.sh` derives `JARVIS_MODEL_LOCAL` from `OLLAMA_MODEL` if it is not already defined. The core also has internal defaults for `OLLAMA_URL`, Anthropic models and embedding model.

Operational note: `docker/docker-compose.yml` starts Kokoro, not LiveKit. If `LIVEKIT_URL` points to a local server, that server must be available with a consistent configuration. If it points to LiveKit Cloud, the cloud key and secret are required.

## Current state

Completed or present in the code:

- React dashboard with AppShell/HUD and workflow panel;
- Python token server and voice agent;
- voice event bridge to the core;
- HTTP core and WebSocket hub;
- shared TypeScript/Python contracts;
- FRIDAY, JARVIS, VERONICA and WAR-MACHINE persona profiles;
- in-process tool registry and MCP;
- workspace policy under `workspaces/`;
- JSONL logger for FRIDAY executions;
- CLI runner for Claude, Codex and Git;
- FRIDAY planner with `architect`, `implementer`, `reviewer` roles;
- real FRIDAY runs with approval gate;
- Codex implementation confined in `workspace-write` sandbox;
- reviewer based on `git diff`;
- HTTP endpoints and voice tools to start, approve and read run state;
- core, contracts and MCP tests connected to the `Makefile`.

In progress or to consolidate:

- connect voice commands more completely to real workflows;
- strengthen approval gate, logging and recovery for long runs;
- persist run state beyond process memory;
- complete the fully local roadmap path;
- transform VERONICA from persona to dedicated executor for massive tasks;
- clarify local/cloud LiveKit deployment as a stable runtime profile.

## Maintenance commands

The project keeps test and generation commands in the `Makefile`:

- `make codegen`: regenerates JSON Schema from Zod contracts and Pydantic models for the voice layer;
- `make test-contracts`: checks TypeScript and Python contracts;
- `make test-mcp-tools`: runs MCP server tests;
- `make setup-mcp-screen`: prepares the MCP screen server virtualenv;
- `make dev-offline` and `make dev-voice`: legacy/offline development targets.

For the full runtime, only one entrypoint remains valid: `./start.sh`.

## Repository notes

- The root `package.json` contains only helper dependencies (`concurrently`) and does not declare npm workspaces.
- Node packages live in `packages/core`, `packages/ui`, `packages/contracts` and the various `tools/mcp-*`.
- `workspaces/` is ignored by Git and is the authorized perimeter for FRIDAY agentic work.
- `logs/` contains runtime logs, including `friday.jsonl`.
- `.env`, `node_modules`, virtualenvs, build output and local caches are excluded from versioning.
