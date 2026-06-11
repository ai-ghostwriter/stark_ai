from offline_voice.tts import DEFAULT_KOKORO_VOICE, resolve_voice


def test_explicit_voice_wins_over_persona() -> None:
    warnings: list[str] = []

    assert resolve_voice(explicit_voice="custom_voice", persona="friday", warn=warnings.append) == "custom_voice"
    assert warnings == []


def test_known_persona_resolves_to_kokoro_voice() -> None:
    assert resolve_voice(explicit_voice=None, persona="jarvis") == "am_adam"
    assert resolve_voice(explicit_voice=None, persona="friday") == "af_sky"


def test_unknown_persona_falls_back_to_default_and_warns() -> None:
    warnings: list[str] = []

    assert resolve_voice(explicit_voice=None, persona="unknown", warn=warnings.append) == DEFAULT_KOKORO_VOICE

    assert len(warnings) == 1
    assert "unknown persona" in warnings[0]
