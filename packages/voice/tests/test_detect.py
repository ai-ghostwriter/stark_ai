import pytest
from personas.detect import detect_persona


def test_jarvis_first_word():
    assert detect_persona("JARVIS cosa c'è in agenda oggi?") == "jarvis"


def test_jarvis_case_insensitive():
    assert detect_persona("jarvis dimmi il meteo") == "jarvis"


def test_friday_first_word():
    assert detect_persona("FRIDAY inviami un promemoria") == "friday"


def test_friday_default_when_no_match():
    assert detect_persona("ciao come stai?") == "friday"


def test_friday_default_on_empty():
    assert detect_persona("") == "friday"


def test_friday_default_on_whitespace():
    assert detect_persona("   ") == "friday"
