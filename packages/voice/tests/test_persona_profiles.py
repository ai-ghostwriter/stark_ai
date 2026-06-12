import importlib
import json
import os
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PROFILE_DIR = ROOT / "core" / "personas" / "profiles"


def _profile(name: str) -> dict:
    return json.loads((PROFILE_DIR / f"{name}.json").read_text(encoding="utf-8"))


def test_persona_modules_load_non_empty_strings_from_json_profiles():
    from personas import friday, jarvis

    for name, module in (("jarvis", jarvis), ("friday", friday)):
        profile = _profile(name)
        assert isinstance(module.AGENT_INSTRUCTION, str)
        assert isinstance(module.SESSION_INSTRUCTION, str)
        assert module.AGENT_INSTRUCTION
        assert module.SESSION_INSTRUCTION
        assert module.AGENT_INSTRUCTION == profile["agentInstruction"]
        assert module.SESSION_INSTRUCTION == profile["sessionInstruction"]

    assert "friday_workflow" in jarvis.SESSION_INSTRUCTION
    assert "friday_workflow" in friday.SESSION_INSTRUCTION


def test_persona_loader_resolves_profiles_independent_from_cwd(tmp_path):
    original_cwd = Path.cwd()
    try:
        os.chdir(tmp_path)
        import personas.jarvis as jarvis
        import personas.friday as friday

        jarvis = importlib.reload(jarvis)
        friday = importlib.reload(friday)

        assert jarvis.AGENT_INSTRUCTION == _profile("jarvis")["agentInstruction"]
        assert friday.SESSION_INSTRUCTION == _profile("friday")["sessionInstruction"]
    finally:
        os.chdir(original_cwd)
