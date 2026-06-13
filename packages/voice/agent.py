# packages/voice/agent.py
import asyncio
import logging
import os
import uuid
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

import httpx
from dotenv import load_dotenv
from google.genai import types
from livekit import agents
from livekit.agents import AgentSession, Agent, RoomInputOptions
from livekit.agents import (
    APIConnectOptions,
    APIConnectionError,
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
)
from livekit.agents import llm
from livekit.plugins import silero
from livekit.plugins import google, openai

from personas import detect_persona, get_persona
from tts_kokoro import make_tts
from tools import (
    get_weather, search_web, send_email,
    set_system_volume_tool, set_microphone_volume_tool, set_music_volume_tool,
)
from core_tools import load_core_tools
from hub_bridge import DEFAULT_HUB_URL, ask_core

load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

DEFAULT_JARVIS_URL = "http://localhost:8787"
DEFAULT_CORE_HUB_URL = DEFAULT_HUB_URL
TOKEN_SERVER_URL = os.getenv("TOKEN_SERVER_URL", "http://localhost:8788")
DEFAULT_MODE = "gemini"
VALID_MODES = {"gemini", "ollama", "claude", "gpt"}


# -- JarvisLLM bridge (calls Core Node at /ask) -------------------------------

class JarvisLLM(llm.LLM):
    def __init__(self, *, jarvis_url: str | None = None, system_prompt: str = "") -> None:
        super().__init__()
        self._jarvis_url = (jarvis_url or os.getenv("JARVIS_URL") or DEFAULT_JARVIS_URL).rstrip("/")
        self._hub_url = os.getenv("STARK_HUB_URL", DEFAULT_CORE_HUB_URL)
        self._system_prompt = system_prompt.strip()

    @property
    def model(self) -> str:
        return "jarvis-ws"

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
            reply_text = await ask_core(
                request_text,
                hub_url=self._jarvis_llm._hub_url,
                jarvis_url=self._jarvis_llm._jarvis_url,
                timeout=self._conn_options.timeout,
                logger=logger,
            )
        except httpx.TimeoutException as exc:
            raise APIConnectionError("JARVIS request timed out.", retryable=True) from exc
        except httpx.HTTPError as exc:
            raise APIConnectionError(f"Could not reach JARVIS: {exc}", retryable=True) from exc
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


async def fetch_persona() -> str:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{TOKEN_SERVER_URL}/persona")
            name = resp.json().get("persona", "friday")
            return name if name in {"jarvis", "friday", "veronica", "warmachine"} else "friday"
    except Exception:
        return "friday"


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

LEGACY_TOOLS = [
    get_weather, search_web, send_email,
    set_system_volume_tool, set_microphone_volume_tool, set_music_volume_tool,
]


async def resolve_session_tools() -> list:
    """Unified tool plane: every mode gets the core registry tools.

    Falls back to the legacy in-process trio only when the core is down.
    """
    core_url = os.getenv("JARVIS_URL", DEFAULT_JARVIS_URL)
    tools = await load_core_tools(core_url)
    if tools:
        logger.info("Loaded %d tools from the core registry at %s", len(tools), core_url)
        return tools
    logger.warning("Core tool plane unavailable — falling back to %d legacy tools", len(LEGACY_TOOLS))
    return LEGACY_TOOLS


async def start_gemini_session(ctx: agents.JobContext, persona_state: dict) -> AgentSession:
    """Set up the Gemini realtime session. Greeting is generated by the caller,
    OUTSIDE the setup timeout: greeting playout can legitimately take longer
    than any watchdog (e.g. the user is still answering the mic permission
    prompt) and must never kill the agent."""
    persona_mod = get_persona(persona_state.get("persona", "friday"))
    session_tools = await resolve_session_tools()
    session = AgentSession()
    await session.start(
        room=ctx.room,
        agent=Agent(
            instructions=persona_mod.AGENT_INSTRUCTION,
            llm=google.beta.realtime.RealtimeModel(
                voice="Fenrir" if persona_state.get("persona") == "jarvis" else "Aoede",
                temperature=0.8,
                output_audio_transcription=types.AudioTranscriptionConfig(),
            ),
            tools=session_tools,
        ),
        room_input_options=RoomInputOptions(),
    )
    return session


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

    session_tools = await resolve_session_tools()
    await session.start(
        room=ctx.room,
        agent=StarkAssistant(persona_state, tools=session_tools),
        room_input_options=RoomInputOptions(),
    )
    await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)


# -- Entry point --------------------------------------------------------------

GEMINI_TIMEOUT_S = 15.0


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    mode = normalize_mode(await get_mode())
    persona_state = {"persona": await fetch_persona()}
    logger.info("Agent dispatched — mode=%s persona=%s room=%s", mode, persona_state["persona"], ctx.room.name)

    if mode == "gemini":
        try:
            session = await asyncio.wait_for(
                start_gemini_session(ctx, persona_state),
                timeout=GEMINI_TIMEOUT_S,
            )
        except (asyncio.TimeoutError, Exception) as exc:
            reason = f"timed out after {GEMINI_TIMEOUT_S:.0f}s" if isinstance(exc, asyncio.TimeoutError) else str(exc)
            if os.getenv("OPENAI_API_KEY"):
                logger.warning("Gemini session setup failed (%s), falling back to gpt pipeline", reason)
                await start_pipeline_session(ctx, "gpt", persona_state)
            else:
                logger.error(
                    "Gemini session setup failed (%s) and OPENAI_API_KEY is not set: "
                    "no pipeline fallback available. Check GOOGLE_GENAI_API_KEY / model availability.",
                    reason,
                )
                raise
            return
        persona_mod = get_persona(persona_state.get("persona", "friday"))
        try:
            await session.generate_reply(instructions=persona_mod.SESSION_INSTRUCTION)
        except Exception as exc:
            logger.warning("Greeting generation failed (%s); session stays up for user turns", exc)
    else:
        await start_pipeline_session(ctx, mode, persona_state)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name="stark"))
