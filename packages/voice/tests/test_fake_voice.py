import json

import pytest

from fake_voice import build_outgoing_event, handle_incoming_message, open_connection


def test_build_outgoing_event_creates_stt_final_for_plain_text() -> None:
    assert build_outgoing_event("ciao") == {"v": 1, "type": "stt.final", "text": "ciao", "lang": "auto"}


def test_build_outgoing_event_creates_barge_in_for_command() -> None:
    assert build_outgoing_event("!barge") == {"v": 1, "type": "barge_in"}


def test_handle_incoming_message_prints_tts_speak() -> None:
    lines: list[str] = []
    warnings: list[str] = []
    raw = json.dumps({"v": 1, "type": "tts.speak", "text": "Sistema pronto", "persona": "jarvis", "voice": "it"})

    handle_incoming_message(raw, write_line=lines.append, warn=warnings.append)

    assert lines == ["🔊 [jarvis/it] Sistema pronto"]
    assert warnings == []


def test_handle_incoming_message_prints_tts_cancel() -> None:
    lines: list[str] = []

    handle_incoming_message(json.dumps({"v": 1, "type": "tts.cancel"}), write_line=lines.append, warn=lambda _: None)

    assert lines == ["[cancel] TTS cancelled"]


def test_handle_incoming_message_warns_and_drops_invalid_events() -> None:
    lines: list[str] = []
    warnings: list[str] = []

    handle_incoming_message("{bad json", write_line=lines.append, warn=warnings.append)

    assert lines == []
    assert len(warnings) == 1
    assert "Dropped invalid event" in warnings[0]


@pytest.mark.asyncio
async def test_open_connection_retries_until_hub_is_ready() -> None:
    attempts = 0

    async def connect(_url: str) -> str:
        nonlocal attempts
        attempts += 1
        if attempts < 3:
            raise OSError("hub not ready")
        return "connected"

    connection = await open_connection("ws://127.0.0.1:7710", connect=connect, attempts=3, delay_seconds=0)

    assert connection == "connected"
    assert attempts == 3
