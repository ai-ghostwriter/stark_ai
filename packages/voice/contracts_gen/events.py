# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'.

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, RootModel


class Role(Enum):
    voice = 'voice'
    hud = 'hud'


class Hello(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: Literal[1]
    type: Literal['hello']
    role: Role
    client: str


class Lang(Enum):
    auto = 'auto'
    it = 'it'
    en = 'en'
    de = 'de'
    fr = 'fr'


class Persona(Enum):
    jarvis = 'jarvis'
    friday = 'friday'
    veronica = 'veronica'
    warmachine = 'warmachine'
    default = 'default'


class Render(Enum):
    stark_brief = 'stark.brief'
    stark_metrics = 'stark.metrics'
    stark_pipeline = 'stark.pipeline'
    stark_intel = 'stark.intel'
    stark_actions = 'stark.actions'


class V(RootModel[Literal[1]]):
    root: Literal[1]


class SttPartial(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['stt.partial']
    text: str


class SttFinal(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['stt.final']
    text: str
    lang: Optional[Lang] = 'auto'


class BargeIn(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['barge_in']


class TtsSpeak(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['tts.speak']
    text: str
    voice: Optional[str] = None
    persona: Optional[Persona] = 'default'


class TtsCancel(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['tts.cancel']


class AgentToken(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['agent.token']
    delta: str


class AgentDone(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['agent.done']


class RouteInfo(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['route.info']
    provider: str
    model: str
    reason: str


class ToolCall(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['tool.call']
    id: str
    name: str
    args: Dict[str, Any]


class ToolResult(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['tool.result']
    id: str
    ok: bool
    data: Optional[Any] = None


class SysError(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['sys.error']
    scope: str
    message: str


class RenderEvent(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    v: V
    type: Literal['render.event']
    id: str
    ts: int
    tool: str
    render: Render
    title: str
    spoken: str
    payload: Dict[str, Any]


class Event(
    RootModel[
        Union[
            Hello,
            SttPartial,
            SttFinal,
            BargeIn,
            TtsSpeak,
            TtsCancel,
            AgentToken,
            AgentDone,
            RouteInfo,
            ToolCall,
            ToolResult,
            SysError,
            RenderEvent,
        ]
    ]
):
    root: Union[
        Hello,
        SttPartial,
        SttFinal,
        BargeIn,
        TtsSpeak,
        TtsCancel,
        AgentToken,
        AgentDone,
        RouteInfo,
        ToolCall,
        ToolResult,
        SysError,
        RenderEvent,
    ]


class Model(RootModel[Event]):
    root: Event
