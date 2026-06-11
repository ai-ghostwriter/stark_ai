from ._profiles import load_profile


_PROFILE = load_profile("veronica")

AGENT_INSTRUCTION = _PROFILE["agentInstruction"]
SESSION_INSTRUCTION = _PROFILE["sessionInstruction"]
VOICE = _PROFILE["voice"]["kokoro"]
