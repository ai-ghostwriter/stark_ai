# packages/voice/agent.py
import os
import uuid
from typing import Any

import httpx
from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.agents import (
    APIConnectOptions,
    APIConnectionError,
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
)
from livekit.agents import llm
from livekit.plugins import noise_cancellation, silero
from livekit.plugins import google, openai

from personas import detect_persona, get_persona
from tts_kokoro import make_tts
from tools import get_weather, search_web, send_email

load_dotenv()

DEFAULT_JARVIS_URL = "http://localhost:8787"
TOKEN_SERVER_URL = os.getenv("TOKEN_SERVER_URL", "http://localhost:8788")
DEFAULT_MODE = "gemini"
VALID_MODES = {"gemini", "ollama", "claude", "gpt"}


# -- JarvisLLM bridge (calls Core Node at /ask) -------------------------------

class JarvisLLM(llm.LLM):
    def __init__(self, *, jarvis_url: str | None = None, system_prompt: str = "") -> None:
        super().__init__()
        self._jarvis_url = (jarvis_url or os.getenv("JARVIS_URL") or DEFAULT_JARVIS_URL).rstrip("/")
        self._system_prompt = system_prompt.strip()

    @property
    def model(self) -> str:
        return "jarvis-http"

    @property
    def provider(self) -> str:
        return "jarvis"

    @property
    def ask_url(self) -> str:
        return f"{self._jarvis_url}/ask"

    def build_jarvis_text(self, chat_ctx: llm.ChatContext) -> str:
        latest_user_text = ""
        for message in chat_ctx.messages():
            text = message.text_content
            if not text:
                continue
            if message.role == "user":
                latest_user_text = text
        return latest_user_text

    def chat(
        self,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool] | None = None,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
        parallel_tool_calls: Any = NOT_GIVEN,
        tool_choice: Any = NOT_GIVEN,
        extra_kwargs: Any = NOT_GIVEN,
    ) -> llm.LLMStream:
        return JarvisLLMStream(
            self,
            chat_ctx=chat_ctx,
            tools=tools or [],
            conn_options=conn_options,
        )

    async def aclose(self) -> None:
        pass


class JarvisLLMStream(llm.LLMStream):
    def __init__(self, jarvis_llm, *, chat_ctx, tools, conn_options):
        super().__init__(jarvis_llm, chat_ctx=chat_ctx, tools=tools, conn_options=conn_options)
        self._jarvis_llm = jarvis_llm

    async def _run(self) -> None:
        request_text = self._jarvis_llm.build_jarvis_text(self._chat_ctx)
        try:
            async with httpx.AsyncClient(timeout=self._conn_options.timeout) as client:
                response = await client.post(
                    self._jarvis_llm.ask_url,
                    json={"text": request_text},
                )
        except httpx.TimeoutException as exc:
            raise APIConnectionError("JARVIS request timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise APIConnectionError(f"Could not reach JARVIS: {exc}", retryable=True) from exc

        if response.status_code != 200:
            raise APIConnectionError(
                f"JARVIS returned HTTP {response.status_code}", retryable=False
            )

        reply_text = response.json().get("reply", "")
        chunk = llm.ChatChunk(
            id=str(uuid.uuid4()),
            delta=llm.ChoiceDelta(role="assistant", content=reply_text),
        )
        self._event_ch.send_nowait(chunk)


# -- Mode + Persona helpers ---------------------------------------------------

async def get_mode() -> str:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{TOKEN_SERVER_URL}/mode")
            return resp.json().get("mode", DEFAULT_MODE)
    except Exception:
        return os.getenv("AGENT_MODE", DEFAULT_MODE)


async def notify_persona(persona: str) -> None:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            await client.post(
                f"{TOKEN_SERVER_URL}/persona",
                json={"persona": persona},
            )
    except Exception:
        pass


def normalize_mode(mode: str) -> str:
    return mode.lower().strip() if mode.lower().strip() in VALID_MODES else DEFAULT_MODE


# -- Persona-aware Agent ------------------------------------------------------

class StarkAssistant(Agent):
    """Agent that detects JARVIS/FRIDAY persona from first user utterance."""

    def __init__(self, persona_state: dict, tools=None) -> None:
        self._persona_state = persona_state
        self._persona_detected = False
        persona_mod = get_persona("friday")
        super().__init__(instructions=persona_mod.AGENT_INSTRUCTION, tools=tools or [])

    async def on_user_turn_completed(
        self, turn_ctx: llm.ChatContext, new_message: llm.ChatMessage
    ) -> None:
        if not self._persona_detected:
            text = new_message.text_content or ""
            persona_name = detect_persona(text)
            self._persona_detected = True
            self._persona_state["persona"] = persona_name
            persona_mod = get_persona(persona_name)
            self.instructions = persona_mod.AGENT_INSTRUCTION
            await notify_persona(persona_name)
        await super().on_user_turn_completed(turn_ctx, new_message)


# -- Session factories --------------------------------------------------------

async def start_gemini_session(ctx: agents.JobContext, persona_state: dict) -> None:
    persona_mod = get_persona(persona_state.get("persona", "friday"))
    session = AgentSession()
    await session.start(
        room=ctx.room,
        agent=Agent(
            llm=google.beta.realtime.RealtimeModel(voice="Aoede", temperature=0.8),
            tools=[get_weather, search_web, send_email],
        ),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
    await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)


async def start_pipeline_session(
    ctx: agents.JobContext, mode: str, persona_state: dict
) -> None:
    if mode in ("ollama", "claude"):
        persona_mod = get_persona(persona_state.get("persona", "friday"))
        selected_llm = JarvisLLM(system_prompt=persona_mod.AGENT_INSTRUCTION)
    elif mode == "gpt":
        selected_llm = openai.LLM(model="gpt-4o-mini")
    else:
        selected_llm = openai.LLM(model="gpt-4o-mini")

    session = AgentSession(
        stt=openai.STT(),
        vad=silero.VAD.load(),
        llm=selected_llm,
        tts=make_tts(persona_state),
    )

    persona_mod = get_persona(persona_state.get("persona", "friday"))

    await session.start(
        room=ctx.room,
        agent=StarkAssistant(persona_state, tools=[get_weather, search_web, send_email]),
        room_input_options=RoomInputOptions(
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )
    await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)


# -- Entry point --------------------------------------------------------------

async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    mode = normalize_mode(await get_mode())
    persona_state = {"persona": "friday"}

    if mode == "gemini":
        await start_gemini_session(ctx, persona_state)
    else:
        await start_pipeline_session(ctx, mode, persona_state)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
