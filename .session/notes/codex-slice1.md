# Codex Slice 1 Session Note

## What changed

- Added the offline WebSocket event hub in `packages/core` on `127.0.0.1:7710`.
- Added `FakeBrain` with fake routing metadata, token streaming, echo `tts.speak`, and `barge_in` cancellation.
- Added the Python `fake_voice.py` stdin stub using generated Pydantic event models for inbound validation.
- Added a non-invasive React offline transcript debug view with a root toggle from the existing LiveKit UI.
- Added `make dev-offline` for hub + fake voice.
- Added focused tests for hub routing/validation, FakeBrain sequencing/cancel, and fake voice handler/retry behavior.

## Files touched

- `Makefile`
- `package.json`
- `package-lock.json`
- `packages/contracts/package.json`
- `packages/core/package.json`
- `packages/core/package-lock.json`
- `packages/core/src/brain/fake.ts`
- `packages/core/src/bus/hub.ts`
- `packages/core/src/bus/index.ts`
- `packages/core/test/fakeBrain.test.ts`
- `packages/core/test/hub.test.ts`
- `packages/voice/fake_voice.py`
- `packages/voice/requirements.txt`
- `packages/voice/tests/test_fake_voice.py`
- `packages/ui/src/App.tsx`
- `packages/ui/src/App.module.scss`
- `packages/ui/src/components/OfflineDebugView/OfflineDebugView.tsx`
- `packages/ui/src/components/OfflineDebugView/OfflineDebugView.module.scss`

## Decisions

- Kept Slice 1 inside the existing STARK-AI packages per `ADAPTATION-STARK-AI.md`.
- Did not modify `packages/contracts/src/**`, contract fixtures, or `packages/voice/contracts_gen/**`.
- Added `exports` metadata to `packages/contracts/package.json` so `@stark-ai/contracts` resolves as a local file dependency from `packages/core`.
- Pinned root `concurrently@9.2.1` as a dev dependency so `make dev-offline` does not prompt for runtime install and remains compatible with local Node 20.10.
- Routed `concurrently` stdin to the `voice` process with `--handle-input --default-input-target voice`.
- Added connection retry in `fake_voice.py` to avoid startup race when hub and voice launch concurrently.

## Validation

- `cd packages/core && npm test`: 113 tests passed.
- `cd packages/voice && ./.venv/bin/pytest tests/ -v`: 40 tests passed.
- `cd packages/contracts && npm test`: 27 tests passed.
- `cd packages/ui && npm run build`: passed; Vite reported the pre-existing large chunk warning.
- `make dev-offline`: started hub + fake voice, accepted stdin, and stopped with both processes exiting cleanly.
- Smoke: phrase through fake voice produced `stt.final`, `route.info`, streamed `agent.token`, `agent.done`, `tts.speak`, and stub TTS print.
- Smoke: `!barge` produced `barge_in` and `tts.cancel`, with stub cancel print.
- Smoke: malformed JSON sent to hub produced `sys.error` with `scope:"hub"` and hub stayed alive.

## Open points

- Browser plugin was unavailable in this session (`iab` not available), and Playwright is not installed locally, so rendered UI QA was limited to build success plus Vite HTTP serving check.
- The UI currently validates hub events structurally only enough for the debug view; runtime contract validation remains on core and Python sides.
