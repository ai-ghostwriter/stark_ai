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
    APIStatusError,
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
)
from livekit.agents import llm
from livekit.plugins import (
    noise_cancellation,
)
from livekit.plugins import google, openai, silero
from prompts import AGENT_INSTRUCTION, SESSION_INSTRUCTION
from tools import get_weather, search_web, send_email

load_dotenv()

DEFAULT_JARVIS_URL = "http://localhost:8787"
TOKEN_SERVER_MODE_URL = "http://localhost:8788/mode"
DEFAULT_MODE = "gemini"
VALID_MODES = {"gemini", "jarvis", "anthropic", "openai"}


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

    @property
    def ask_url(self) -> str:
        return f"{self._jarvis_url}/ask"

    def build_jarvis_text(self, chat_ctx: llm.ChatContext) -> str:
        latest_user_text = ""
        latest_non_system_text = ""

        for message in chat_ctx.messages():
            text = message.text_content
            if not text:
                continue
            if message.role == "user":
                latest_user_text = text
            if message.role not in ("system", "developer"):
                latest_non_system_text = text

        user_text = latest_user_text or latest_non_system_text
        if not user_text:
            user_text = SESSION_INSTRUCTION.strip()

        if not self._system_prompt:
            return user_text

        return (
            "System context for the voice assistant:\n"
            f"{self._system_prompt}\n\n"
            "User request:\n"
            f"{user_text}"
        )


class JarvisLLMStream(llm.LLMStream):
    def __init__(
        self,
        jarvis_llm: JarvisLLM,
        *,
        chat_ctx: llm.ChatContext,
        tools: list[llm.Tool],
        conn_options: APIConnectOptions,
    ) -> None:
        super().__init__(
            jarvis_llm,
            chat_ctx=chat_ctx,
            tools=tools,
            conn_options=conn_options,
        )
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

        if response.status_code >= 400:
            raise APIStatusError(
                f"JARVIS returned HTTP {response.status_code}.",
                status_code=response.status_code,
                body=response.text,
            )

        try:
            payload = response.json()
        except ValueError as exc:
            raise APIStatusError(
                "JARVIS returned a non-JSON response.",
                status_code=response.status_code,
                body=response.text,
                retryable=False,
            ) from exc

        reply = payload.get("reply")
        if not isinstance(reply, str) or not reply.strip():
            raise APIStatusError(
                "JARVIS response is missing a non-empty 'reply' field.",
                status_code=response.status_code,
                body=payload,
                retryable=False,
            )

        self._event_ch.send_nowait(
            llm.ChatChunk(
                id=f"jarvis_{uuid.uuid4().hex}",
                delta=llm.ChoiceDelta(role="assistant", content=reply.strip()),
            )
        )


class Assistant(Agent):
    def __init__(self, llm=None, tools=None) -> None:
        kwargs = {"instructions": AGENT_INSTRUCTION}
        if llm is not None:
            kwargs["llm"] = llm
        if tools is not None:
            kwargs["tools"] = tools
        super().__init__(**kwargs)


async def get_mode() -> str:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(TOKEN_SERVER_MODE_URL)
            if resp.status_code == 200:
                return resp.json().get("mode", DEFAULT_MODE)
    except Exception:
        pass
    return os.getenv("AGENT_MODE", DEFAULT_MODE)


def normalize_mode(mode: str) -> str:
    selected = mode.lower().strip()
    if selected not in VALID_MODES:
        return DEFAULT_MODE
    return selected


def create_anthropic_llm():
    try:
        from livekit.plugins import anthropic

        return anthropic.LLM(model="claude-sonnet-4-6")
    except Exception:
        return openai.LLM(model="claude-sonnet-4-6")


async def start_gemini_session(ctx: agents.JobContext) -> None:
    session = AgentSession()

    await session.start(
        room=ctx.room,
        agent=Assistant(
            llm=google.beta.realtime.RealtimeModel(voice="Aoede", temperature=0.8),
            tools=[get_weather, search_web, send_email],
        ),
        room_input_options=RoomInputOptions(
            video_enabled=True,
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    await session.generate_reply(instructions=SESSION_INSTRUCTION)


async def start_pipeline_session(ctx: agents.JobContext, mode: str) -> None:
    if mode == "jarvis":
        selected_llm = JarvisLLM(system_prompt=AGENT_INSTRUCTION)
    elif mode == "anthropic":
        selected_llm = create_anthropic_llm()
    else:
        selected_llm = openai.LLM(model="gpt-4o-mini")

    session = AgentSession(
        stt=openai.STT(),
        vad=silero.VAD.load(),
        llm=selected_llm,
        tts=openai.TTS(voice="ash"),
    )

    await session.start(
        room=ctx.room,
        agent=Assistant(),
        room_input_options=RoomInputOptions(
            video_enabled=True,
            noise_cancellation=noise_cancellation.BVC(),
        ),
    )

    await session.generate_reply(instructions=SESSION_INSTRUCTION)


async def entrypoint(ctx: agents.JobContext):
    await ctx.connect()
    mode = normalize_mode(await get_mode())

    if mode == "gemini":
        await start_gemini_session(ctx)
        return

    await start_pipeline_session(ctx, mode)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint))
