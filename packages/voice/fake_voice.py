from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Callable
from typing import Any, Awaitable

import websockets
from pydantic import ValidationError

from contracts_gen import Event
from contracts_gen.events import AgentDone, AgentToken, RouteInfo, SysError, TtsCancel, TtsSpeak

DEFAULT_URL = "ws://127.0.0.1:7710"
CLIENT_NAME = "fake-voice@0.1"
CONNECT_ATTEMPTS = 20
CONNECT_RETRY_SECONDS = 0.2


def build_outgoing_event(line: str) -> dict[str, Any] | None:
    text = line.strip()
    if not text:
        return None
    if text == "!barge":
        return {"v": 1, "type": "barge_in"}
    return {"v": 1, "type": "stt.final", "text": text, "lang": "auto"}


def parse_incoming_message(raw: str) -> Event:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc

    try:
        return Event.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


def enum_value(value: Any) -> str:
    return str(getattr(value, "value", value))


def handle_incoming_message(
    raw: str,
    *,
    write_line: Callable[[str], None],
    warn: Callable[[str], None],
) -> None:
    try:
        event = parse_incoming_message(raw).root
    except ValueError as exc:
        warn(f"Dropped invalid event: {exc}")
        return

    if isinstance(event, TtsSpeak):
        persona = enum_value(event.persona or "default")
        voice = event.voice or "-"
        write_line(f"🔊 [{persona}/{voice}] {event.text}")
    elif isinstance(event, TtsCancel):
        write_line("[cancel] TTS cancelled")
    elif isinstance(event, (AgentToken, AgentDone, RouteInfo, SysError)):
        return
    else:
        warn(f"Dropped unsupported inbound event: {event.type}")


async def stdin_lines() -> Any:
    loop = asyncio.get_running_loop()
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await loop.connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        line = await reader.readline()
        if line == b"":
            break
        yield line.decode()


async def send_stdin_events(socket: Any) -> None:
    async for line in stdin_lines():
        event = build_outgoing_event(line)
        if event is None:
            continue
        await socket.send(json.dumps(event))


async def receive_events(socket: Any) -> None:
    async for raw in socket:
        handle_incoming_message(
            raw,
            write_line=lambda line: print(line, flush=True),
            warn=lambda message: print(f"[warn] {message}", file=sys.stderr),
        )


async def open_connection(
    url: str,
    *,
    connect: Callable[[str], Awaitable[Any]] = websockets.connect,
    attempts: int = CONNECT_ATTEMPTS,
    delay_seconds: float = CONNECT_RETRY_SECONDS,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return await connect(url)
        except OSError as exc:
            last_error = exc
            if attempt == attempts - 1:
                break
            await asyncio.sleep(delay_seconds)

    if last_error is not None:
        raise last_error
    raise ConnectionError("Could not connect to hub.")


async def run(url: str = DEFAULT_URL) -> None:
    socket = await open_connection(url)
    try:
        await socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": CLIENT_NAME}))
        await asyncio.gather(send_stdin_events(socket), receive_events(socket))
    finally:
        await socket.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="STARK-AI fake offline voice client.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Hub WebSocket URL.")
    args = parser.parse_args()
    try:
        asyncio.run(run(args.url))
    except KeyboardInterrupt:
        return


if __name__ == "__main__":
    main()
