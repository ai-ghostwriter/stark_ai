import json

import httpx
import pytest

from hub_bridge import ask_core, ask_hub


class FakeSocket:
    def __init__(self, incoming: list[dict]):
        self.incoming = [json.dumps(item) for item in incoming]
        self.sent: list[dict] = []
        self.closed = False

    async def send(self, raw: str) -> None:
        self.sent.append(json.loads(raw))

    def __aiter__(self):
        return self

    async def __anext__(self) -> str:
        if not self.incoming:
            raise StopAsyncIteration
        return self.incoming.pop(0)

    async def close(self) -> None:
        self.closed = True


@pytest.mark.asyncio
async def test_ask_hub_sends_voice_events_and_returns_tts_speak_text() -> None:
    socket = FakeSocket([
        {"v": 1, "type": "route.info", "provider": "local", "model": "qwen", "reason": "test"},
        {"v": 1, "type": "agent.token", "delta": "ciao"},
        {"v": 1, "type": "tts.speak", "text": "Ciao Ricky", "persona": "jarvis"},
    ])

    async def connect(url: str) -> FakeSocket:
        assert url == "ws://hub"
        return socket

    reply = await ask_hub("ciao", url="ws://hub", connect=connect, timeout=1.0)

    assert reply == "Ciao Ricky"
    assert socket.sent == [
        {"v": 1, "type": "hello", "role": "voice", "client": "livekit-agent@0.1"},
        {"v": 1, "type": "stt.final", "text": "ciao", "lang": "auto"},
    ]
    assert socket.closed is True


@pytest.mark.asyncio
async def test_ask_core_falls_back_to_http_when_hub_is_unreachable() -> None:
    async def connect(_url: str) -> FakeSocket:
        raise OSError("hub down")

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "http://jarvis/ask"
        assert json.loads(request.content) == {"text": "ciao"}
        return httpx.Response(200, json={"reply": "HTTP fallback"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        reply = await ask_core(
            "ciao",
            hub_url="ws://hub",
            jarvis_url="http://jarvis",
            connect=connect,
            http_client=client,
            timeout=1.0,
        )

    assert reply == "HTTP fallback"
