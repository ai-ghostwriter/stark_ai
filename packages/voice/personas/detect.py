_WAKE_WORDS = {
    "JARVIS": "jarvis",
    "VERONICA": "veronica",
    "WARMACHINE": "warmachine",
    "WAR-MACHINE": "warmachine",
}


def detect_persona(text: str) -> str:
    """Detect the persona from the first word(s) of the utterance.

    'WAR MACHINE' (two words) is also recognized. Anything that is not an
    explicit wake word falls back to FRIDAY, the default assistant.
    """
    words = text.strip().upper().split()
    if not words:
        return "friday"
    if words[0] == "WAR" and len(words) > 1 and words[1] == "MACHINE":
        return "warmachine"
    return _WAKE_WORDS.get(words[0], "friday")
