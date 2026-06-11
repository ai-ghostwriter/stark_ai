# Codex Slice 2 Session Note

## What changed

- Added the real offline voice client package in `packages/voice/offline_voice/`.
- Implemented frame-based mic capture and interruptible WAV speaker playback with `sounddevice`.
- Implemented WebRTC VAD with 30 ms / 16 kHz PCM frames.
- Implemented lazy `faster-whisper` STT with configurable model size via `WHISPER_MODEL` and contract language mapping.
- Implemented Kokoro TTS client using the local OpenAI-compatible `/v1/audio/speech` endpoint from `KOKORO_URL`.
- Implemented a pure conversation FSM for IDLE/LISTENING/TRANSCRIBING/WAITING/SPEAKING and barge-in.
- Added `python -m offline_voice [--url ...] [--wav path]` entrypoint.
- Added `make dev-voice` for hub + real offline voice; kept `make dev-offline` untouched.
- Added headless pytest coverage for FSM, language mapping, and voice resolution.

## Files touched

- `Makefile`
- `packages/voice/requirements.txt`
- `packages/voice/offline_voice/__init__.py`
- `packages/voice/offline_voice/__main__.py`
- `packages/voice/offline_voice/audio_io.py`
- `packages/voice/offline_voice/client.py`
- `packages/voice/offline_voice/fsm.py`
- `packages/voice/offline_voice/stt.py`
- `packages/voice/offline_voice/tts.py`
- `packages/voice/offline_voice/vad.py`
- `packages/voice/tests/test_offline_fsm.py`
- `packages/voice/tests/test_offline_lang.py`
- `packages/voice/tests/test_offline_tts.py`

## Decisions

- VAD choice: `webrtcvad-wheels==2.0.14`. It is lighter than Silero for laptop CPU, has Python 3.13 macOS arm64 wheels, and avoids loading Torch/ONNX VAD models for the always-listening loop.
- Whisper default model: `small` multilingual via `WHISPER_MODEL`, per roadmap quality target. Smoke used `tiny` to keep model download and latency reasonable.
- Whisper loading is lazy: importing `offline_voice` does not download or initialize a model.
- `KOKORO_URL` default is `http://localhost:8880`; the client posts to `/v1/audio/speech`, while still accepting env values that already end in `/v1`.
- Explicit `tts.speak.voice` wins over persona voice mapping. Unknown personas fall back to default `am_adam` and warn.
- `OFFLINE_VOICE_NO_PLAYBACK=1` can skip local speaker output for headless smoke tests only; audio bytes still never cross the WS boundary.

## Validation

- Dependency install into `packages/voice/.venv`: `faster-whisper==1.1.1`, `sounddevice==0.5.1`, `webrtcvad-wheels==2.0.14`, `numpy`.
- Import verification succeeded for `faster_whisper`, `sounddevice`, `webrtcvad`, `numpy`, and `offline_voice.client`.
- `cd packages/voice && ./.venv/bin/pytest tests/ -v`: 49 passed.

## Smoke test

- Generated `.session/tmp/offline_voice_smoke.wav` with macOS `say` plus `afconvert`: mono 16 kHz 16-bit PCM WAV.
- Started `packages/core` hub on `ws://127.0.0.1:7710`.
- Started a HUD WebSocket listener to observe bus events.
- First `WHISPER_MODEL=tiny` run failed because Hugging Face model metadata connection reset and no local snapshot was present.
- Explicit model bootstrap with `HF_HUB_DISABLE_XET=1` and CPU succeeded.
- Second run:
  - Command: `WHISPER_MODEL=tiny WHISPER_DEVICE=cpu HF_HUB_DISABLE_XET=1 OFFLINE_VOICE_NO_PLAYBACK=1 ./.venv/bin/python -m offline_voice --wav ../../.session/tmp/offline_voice_smoke.wav`
  - Observed HUD events: `stt.partial`, `stt.final`, `route.info`, streamed `agent.token`, `agent.done`, and `tts.speak`.
  - Observed transcript: `"lo garris."`, language `"it"` from Whisper tiny on the generated `say` WAV.
  - Observed `tts.speak`: `Ho ricevuto: "lo garris."`.
  - Kokoro synthesis was not verified because `curl http://localhost:8880/v1/models` failed with connection refused and the client logged `TTS playback failed: All connection attempts failed`.

## Open points

- Run a final end-to-end TTS playback test when the local Kokoro container is actually listening on `localhost:8880`.
- Try a cleaner recorded human WAV for accuracy; the synthetic macOS `say` sample was enough for event-path smoke but not for transcript quality.
- Barge-in is unit-covered in the pure FSM. A live mic + speaker barge-in test remains a manual hardware test.
