import os
from typing import Any

KOKORO_DEFAULT_URL = "http://localhost:8880/v1"

_VOICE_MAP = {
    "jarvis": "am_adam",
    "friday": "af_sky",
}


def get_voice_for_persona(persona: str) -> str:
    """Return Kokoro voice name for the given persona."""
    return _VOICE_MAP.get(persona, "af_sky")


def make_tts(persona_state: dict) -> Any:
    """Create an OpenAI-compatible TTS instance pointing at local Kokoro.

    persona_state is a mutable dict {"persona": "friday"} read at call time,
    so the voice reflects the current persona at synthesis time.
    """
    from livekit.plugins import openai as openai_plugin

    voice = get_voice_for_persona(persona_state.get("persona", "friday"))
    base_url = os.getenv("KOKORO_URL", KOKORO_DEFAULT_URL)
    return openai_plugin.TTS(
        base_url=base_url,
        api_key="not-needed",
        voice=voice,
        model="kokoro",
    )
