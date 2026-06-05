import os
import pytest
from unittest.mock import patch, MagicMock
from tts_kokoro import get_voice_for_persona, KOKORO_DEFAULT_URL


def test_jarvis_voice():
    assert get_voice_for_persona("jarvis") == "am_adam"


def test_friday_voice():
    assert get_voice_for_persona("friday") == "af_sky"


def test_unknown_persona_defaults_to_friday_voice():
    assert get_voice_for_persona("unknown") == "af_sky"


def test_kokoro_default_url():
    assert KOKORO_DEFAULT_URL == "http://localhost:8880/v1"
