# VAD tuning + echo guard (Codex impl, Claude review) — 11/06/2026

Field evidence: one full voice turn worked, then VAD retriggered on ambient
noise and on Kokoro's own playback; Whisper hallucinated on micro-segments
("You"); real utterances were dropped silently.

Fixes: status once per turn + visible discards; anti-hallucination filter
(min duration, blacklist) before stt.final; VAD debounce 200ms / hangover
700ms; echo guard during SPEAKING (sustained 400ms speech required for
barge-in) + 300ms post-playback refractory window; WHISPER_LANGUAGE pin.

Env knobs (defaults): OFFLINE_VOICE_VAD_AGGRESSIVENESS=2,
OFFLINE_VOICE_SPEECH_START_MS=200, OFFLINE_VOICE_SPEECH_END_MS=700,
OFFLINE_VOICE_BARGE_MS=400, OFFLINE_VOICE_REFRACTORY_MS=300,
OFFLINE_VOICE_MIN_SPEECH_S=0.4, WHISPER_LANGUAGE=auto.

79 pytest green. Headless --wav verified post-tuning.
