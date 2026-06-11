#!/usr/bin/env bash
# start.sh - avvia tutti i servizi STARK-AI

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
LOCAL_VENV="$ROOT/packages/voice/.venv"

CORE_PID=""
HUB_PID=""
TOKEN_PID=""
AGENT_PID=""
UI_PID=""

cleanup() {
  echo ""
  echo "Arresto servizi STARK-AI..."
  for pid in "$CORE_PID" "$HUB_PID" "$TOKEN_PID" "$AGENT_PID" "$UI_PID"; do
    if [[ -n "$pid" ]]; then
      pkill -P "$pid" 2>/dev/null || true
      kill "$pid" 2>/dev/null || true
    fi
  done
  # LiveKit agents spawn job subprocesses that outlive their parent: reap them.
  pkill -f "multiprocessing.spawn" 2>/dev/null || true
  docker compose -f "$ROOT/docker/docker-compose.yml" down
}

if [[ ! -f "$ROOT/.env" ]]; then
  echo "Errore: manca $ROOT/.env"
  echo "Copia .env.example in .env e compila le chiavi prima di avviare STARK-AI."
  exit 1
fi

set -a
source "$ROOT/.env"
set +a

export JARVIS_PORT="${JARVIS_PORT:-8787}"
export JARVIS_MODEL_LOCAL="${JARVIS_MODEL_LOCAL:-${OLLAMA_MODEL:-qwen3:8b}}"
export JARVIS_URL="${JARVIS_URL:-http://localhost:8787}"
export KOKORO_URL="${KOKORO_URL:-http://localhost:8880/v1}"
export TOKEN_SERVER_URL="${TOKEN_SERVER_URL:-http://localhost:8788}"

if [[ ! -x "$LOCAL_VENV/bin/python" ]]; then
  echo "Creo venv per packages/voice..."
  python3 -m venv "$LOCAL_VENV"
  "$LOCAL_VENV/bin/python" -m pip install --upgrade pip
  "$LOCAL_VENV/bin/python" -m pip install -r "$ROOT/packages/voice/requirements.txt"
fi
PYTHON="$LOCAL_VENV/bin/python"

trap cleanup INT TERM EXIT

echo "Avvio Docker (Kokoro TTS)..."
docker compose -f "$ROOT/docker/docker-compose.yml" up -d

echo "Avvio Core Node (porta 8787)..."
(
  cd "$ROOT/packages/core"
  npm run serve
) &
CORE_PID=$!

echo "Avvio Event Hub WS (porta 7710, brain=real)..."
(
  cd "$ROOT/packages/core"
  STARK_BRAIN="${STARK_BRAIN:-real}" npm run dev:hub
) &
HUB_PID=$!

echo "Avvio Token Server (porta 8788)..."
(
  cd "$ROOT/packages/voice"
  "$PYTHON" token_server.py
) &
TOKEN_PID=$!

echo "Avvio Voice Agent..."
(
  cd "$ROOT/packages/voice"
  "$PYTHON" agent.py start
) &
AGENT_PID=$!

echo "Avvio UI (porta 5173)..."
(
  cd "$ROOT/packages/ui"
  npm run dev -- --port 5173
) &
UI_PID=$!

echo ""
echo "STARK-AI online"
echo "  UI:           http://localhost:5173"
echo "  Token server: http://localhost:8788"
echo "  Core Node:    http://localhost:8787"
echo "  Event Hub WS: ws://127.0.0.1:7710"
echo "  Kokoro TTS:   http://localhost:8880"
echo "  LiveKit:      wss://jarvis-owcf3g35.livekit.cloud (cloud)"
echo ""
echo "Premi CTRL+C per fermare tutto."

wait
