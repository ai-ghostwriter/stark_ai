import json

import pytest

import volume


def test_parse_level_numbers_and_keywords():
    assert volume._parse_level(50) == 50
    assert volume._parse_level("70") == 70
    assert volume._parse_level("70%") == 70
    assert volume._parse_level("mute") == 0
    assert volume._parse_level("max") == 100
    assert volume._parse_level(250) == 100
    assert volume._parse_level(-5) == 0
    assert volume._parse_level("nonsense") == 50


def test_set_system_volume_calls_osascript(monkeypatch):
    calls = []
    monkeypatch.setattr(volume.subprocess, "run", lambda *a, **k: calls.append((a, k)))
    assert volume.set_system_volume("60") == 60
    args = calls[0][0][0]
    assert args == ["osascript", "-e", "set volume output volume 60"]


def test_set_microphone_volume_calls_osascript(monkeypatch):
    calls = []
    monkeypatch.setattr(volume.subprocess, "run", lambda *a, **k: calls.append((a, k)))
    assert volume.set_microphone_volume(40) == 40
    args = calls[0][0][0]
    assert args == ["osascript", "-e", "set volume input volume 40"]


@pytest.mark.asyncio
async def test_set_music_volume_publishes_ui_control():
    sent = []

    class FakeSocket:
        async def send(self, data):
            sent.append(json.loads(data))
        async def close(self):
            pass

    async def fake_connect(url):
        return FakeSocket()

    result = await volume.set_music_volume(30, connect=fake_connect)
    assert result == 30
    event = sent[-1]
    assert event == {"v": 1, "type": "ui.control", "target": "music", "action": "set", "value": 30}
