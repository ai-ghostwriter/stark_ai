from .detect import detect_persona
from . import friday, jarvis

_PERSONAS = {
    "friday": friday,
    "jarvis": jarvis,
}


def get_persona(name: str):
    """Return persona module for 'jarvis' or 'friday'. Defaults to friday."""
    return _PERSONAS.get(name, friday)
