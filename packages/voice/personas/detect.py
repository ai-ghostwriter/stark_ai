def detect_persona(text: str) -> str:
    """Return 'jarvis' or 'friday' based on the first word of text."""
    first_word = text.strip().split()[0].upper() if text.strip() else ""
    return "jarvis" if first_word == "JARVIS" else "friday"
