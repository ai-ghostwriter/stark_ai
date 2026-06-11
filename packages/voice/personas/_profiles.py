from __future__ import annotations

import json
from pathlib import Path
from typing import Any


PROFILE_DIR = Path(__file__).resolve().parents[2] / "core" / "personas" / "profiles"


def load_profile(persona_id: str) -> dict[str, Any]:
    path = PROFILE_DIR / f"{persona_id}.json"
    with path.open(encoding="utf-8") as profile_file:
        return json.load(profile_file)
