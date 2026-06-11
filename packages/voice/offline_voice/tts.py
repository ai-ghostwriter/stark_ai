from __future__ import annotations

import os
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

KOKORO_DEFAULT_URL = "http://localhost:8880"
KOKORO_MODEL = "kokoro"
PERSONA_VOICES = {
    "jarvis": {"kokoro": "am_adam", "edgetts": "en-US-GuyNeural"},
    "friday": {"kokoro": "af_sky", "edgetts": "en-IE-EmilyNeural"},
    "veronica": {"kokoro": "af_bella", "edgetts": "en-GB-SoniaNeural"},
    "warmachine": {"kokoro": "am_michael", "edgetts": "en-US-ChristopherNeural"},
    "default": {"kokoro": "am_adam", "edgetts": "en-US-GuyNeural"},
}
DEFAULT_KOKORO_VOICE = PERSONA_VOICES["default"]["kokoro"]


def _enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def resolve_voice(
    *,
    explicit_voice: str | None,
    persona: Any = "default",
    warn: Callable[[str], None] | None = None,
) -> str:
    if explicit_voice:
        return explicit_voice

    persona_id = _enum_value(persona or "default")
    voice = PERSONA_VOICES.get(persona_id)
    if voice is None:
        if warn is not None:
            warn(f"unknown persona '{persona_id}', using default Kokoro voice")
        voice = PERSONA_VOICES["default"]
    return voice["kokoro"]


def kokoro_speech_endpoint(base_url: str) -> str:
    base = base_url.rstrip("/")
    if base.endswith("/v1"):
        return f"{base}/audio/speech"
    return f"{base}/v1/audio/speech"


@dataclass
class KokoroTTS:
    base_url: str | None = None
    warn: Callable[[str], None] | None = None

    def __post_init__(self) -> None:
        self.base_url = self.base_url or os.getenv("KOKORO_URL", KOKORO_DEFAULT_URL)

    async def synthesize(self, text: str, *, voice: str) -> bytes:
        import httpx

        payload = {
            "model": KOKORO_MODEL,
            "voice": voice,
            "input": text,
            "response_format": "wav",
        }
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(kokoro_speech_endpoint(self.base_url or KOKORO_DEFAULT_URL), json=payload)
            response.raise_for_status()
            return response.content

    async def speak(self, text: str, *, persona: Any = "default", voice: str | None = None, player: Any) -> None:
        selected_voice = resolve_voice(explicit_voice=voice, persona=persona, warn=self.warn)
        wav_bytes = await self.synthesize(text, voice=selected_voice)
        await player.play_wav_bytes(wav_bytes)
