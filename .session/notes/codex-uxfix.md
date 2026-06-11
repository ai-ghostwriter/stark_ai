# Codex UX Fix — Offline Voice

Date: 2026-06-11

## Scope

- Fixed `make dev-voice` so Kokoro TTS is auto-started when `http://localhost:8880/v1/models` is not reachable.
- Left `make dev-offline` unchanged; it still does not require Kokoro.
- Added visible runtime status output for the headless offline voice client.

## Behavior

- `make dev-voice` now:
  - proceeds immediately if Kokoro responds on `:8880`;
  - runs `docker compose -f docker/docker-compose.yml up -d kokoro` when Docker is available;
  - polls Kokoro for up to 30 seconds;
  - continues with a clear warning if Kokoro is still warming up;
  - warns that replies will be silent if Docker is unavailable.

- `packages/voice/offline_voice` now reports:
  - VAD status;
  - Whisper model/device/compute configuration before lazy load;
  - Whisper lazy-load start and ready lines;
  - hub connection;
  - Kokoro reachability;
  - microphone device opening;
  - listening state;
  - final transcript;
  - spoken reply text.

## Verification

- `cd packages/voice && ./.venv/bin/pytest tests/ -q`
- Smoke `make dev-voice` with Kokoro stopped to confirm Docker starts the `kokoro` service automatically.
- Use `python -m offline_voice --wav <file>` for headless transcript/status checks.
