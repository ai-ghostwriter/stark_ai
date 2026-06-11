from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import websockets
from pydantic import ValidationError

from contracts_gen import Event
from contracts_gen.events import TtsSpeak

DEFAULT_HUB_URL = "ws://127.0.0.1:7710"
DEFAULT_JARVIS_URL = "http://localhost:8787"
CLIENT_NAME = "livekit-agent@0.1"

ConnectFn = Callable[[str], Awaitable[Any]]


class HubBridgeError(RuntimeError):
    pass


def parse_inbound(raw: str) -> Any:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise HubBridgeError(f"Invalid hub JSON: {exc}") from exc

    try:
        return Event.model_validate(payload).root
    except ValidationError as exc:
        raise HubBridgeError(str(exc)) from exc


async def ask_hub(
    text: str,
    *,
    url: str = DEFAULT_HUB_URL,
    connect: ConnectFn = websockets.connect,
    timeout: float = 15.0,
) -> str:
    socket: Any | None = None
    try:
        async with asyncio.timeout(timeout):
            socket = await connect(url)
            await socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": CLIENT_NAME}))
            await socket.send(json.dumps({"v": 1, "type": "stt.final", "text": text, "lang": "auto"}))

            async for raw in socket:
                event = parse_inbound(raw)
                if isinstance(event, TtsSpeak):
                    return event.text
    except TimeoutError as exc:
        raise HubBridgeError("Timed out waiting for hub tts.speak.") from exc
    except OSError as exc:
        raise HubBridgeError(f"Could not reach hub: {exc}") from exc
    finally:
        if socket is not None:
            await socket.close()

    raise HubBridgeError("Hub closed before tts.speak.")


async def ask_http(
    text: str,
    *,
    jarvis_url: str = DEFAULT_JARVIS_URL,
    http_client: httpx.AsyncClient | None = None,
    timeout: float = 15.0,
) -> str:
    close_client = http_client is None
    client = http_client or httpx.AsyncClient(timeout=timeout)
    try:
        response = await client.post(f"{jarvis_url.rstrip('/')}/ask", json={"text": text})
        response.raise_for_status()
        return str(response.json().get("reply", ""))
    finally:
        if close_client:
            await client.aclose()


async def ask_core(
    text: str,
    *,
    hub_url: str = DEFAULT_HUB_URL,
    jarvis_url: str = DEFAULT_JARVIS_URL,
    connect: ConnectFn = websockets.connect,
    http_client: httpx.AsyncClient | None = None,
    timeout: float = 15.0,
    logger: logging.Logger | None = None,
) -> str:
    try:
        return await ask_hub(text, url=hub_url, connect=connect, timeout=timeout)
    except HubBridgeError as exc:
        (logger or logging.getLogger(__name__)).warning(
            "STARK-AI hub unavailable (%s); falling back to HTTP /ask",
            exc,
        )
        return await ask_http(text, jarvis_url=jarvis_url, http_client=http_client, timeout=timeout)
