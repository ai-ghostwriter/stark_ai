"""Contract tests: golden fixtures from @stark-ai/contracts validate against generated Pydantic models.

This is the Python half of the anti-drift lock (see docs/mark-r/SLICE-0-SPEC.md §5).
"""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from contracts_gen import Event, PersonaProfile

FIXTURES = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"


def fixtures(group: str, sub: str) -> list[Path]:
    files = sorted((FIXTURES / group / sub).glob("*.json"))
    assert files, f"no fixtures found in {group}/{sub}"
    return files


@pytest.mark.parametrize("path", fixtures("events", "valid"), ids=lambda p: p.name)
def test_valid_event_fixture_validates(path: Path) -> None:
    Event.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("events", "invalid"), ids=lambda p: p.name)
def test_invalid_event_fixture_is_rejected(path: Path) -> None:
    with pytest.raises(ValidationError):
        Event.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("persona", "valid"), ids=lambda p: p.name)
def test_valid_persona_fixture_validates(path: Path) -> None:
    PersonaProfile.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("persona", "invalid"), ids=lambda p: p.name)
def test_invalid_persona_fixture_is_rejected(path: Path) -> None:
    with pytest.raises(ValidationError):
        PersonaProfile.model_validate(json.loads(path.read_text()))
