from offline_voice.stt import map_whisper_language


def test_supported_whisper_languages_pass_through() -> None:
    assert map_whisper_language("it") == "it"
    assert map_whisper_language("en") == "en"
    assert map_whisper_language("de") == "de"
    assert map_whisper_language("fr") == "fr"


def test_unknown_or_empty_whisper_languages_map_to_auto() -> None:
    assert map_whisper_language("es") == "auto"
    assert map_whisper_language("") == "auto"
    assert map_whisper_language(None) == "auto"

