# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'.

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, RootModel


class Preferred(Enum):
    local = 'local'
    cloud = 'cloud'


class RoutingHints(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    preferred: Preferred
    escalateOn: Optional[List[str]] = []


class Id(Enum):
    jarvis = 'jarvis'
    friday = 'friday'
    veronica = 'veronica'
    default = 'default'


class Language(Enum):
    auto = 'auto'
    it = 'it'
    en = 'en'
    de = 'de'
    fr = 'fr'


class PersonaProfile(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    id: Id
    displayName: str
    voice: Dict[str, str]
    agentInstruction: str
    sessionInstruction: str
    routingHints: RoutingHints
    language: Optional[Language] = 'auto'


class Model(RootModel[PersonaProfile]):
    root: PersonaProfile
