from .detect import detect_persona
from . import friday, jarvis, veronica, warmachine

_PERSONAS = {
    "friday": friday,
    "jarvis": jarvis,
    "veronica": veronica,
    "warmachine": warmachine,
}


def get_persona(name: str):
    """Return the persona module for a known persona id. Defaults to friday."""
    return _PERSONAS.get(name, friday)
