"""Controllo volume per l'agente vocale (fallback/standalone).

Output e microfono via osascript (macOS). Musica via evento ui.control sull'hub.
Il path canonico per l'agente resta mcp-os; questi sono i wrapper Python di riserva
e utilizzabili come libreria.
"""
from __future__ import annotations

import json
import subprocess
from collections.abc import Awaitable, Callable
from typing import Any, Union

import websockets

DEFAULT_HUB_URL = "ws://127.0.0.1:7710"
ConnectFn = Callable[[str], Awaitable[Any]]

Level = Union[int, float, str]


def _parse_level(level: Level, default: int = 50) -> int:
    """Converte numero, percentuale o keyword ('mute'/'max') in 0-100."""
    if isinstance(level, str):
        s = level.strip().lower()
        if s in ("mute", "muted", "off"):
            return 0
        if s in ("max", "full"):
            return 100
        s = s.rstrip("%")
        try:
            level = float(s)
        except ValueError:
            return default
    try:
        n = int(round(float(level)))
    except (TypeError, ValueError):
        return default
    return max(0, min(100, n))


def set_system_volume(level: Level) -> int:
    """Imposta il volume output di sistema (macOS)."""
    n = _parse_level(level)
    subprocess.run(["osascript", "-e", f"set volume output volume {n}"], check=True, timeout=5)
    return n


def set_microphone_volume(level: Level) -> int:
    """Imposta il volume input del microfono (macOS). 'mute' => 0."""
    n = _parse_level(level)
    subprocess.run(["osascript", "-e", f"set volume input volume {n}"], check=True, timeout=5)
    return n


async def set_music_volume(
    level: Level,
    *,
    hub_url: str = DEFAULT_HUB_URL,
    connect: ConnectFn = websockets.connect,
) -> int:
    """Pubblica un evento ui.control sull'hub per regolare la musica della UI."""
    n = _parse_level(level)
    socket = await connect(hub_url)
    try:
        await socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": "voice-volume"}))
        await socket.send(json.dumps({"v": 1, "type": "ui.control", "target": "music", "action": "set", "value": n}))
    finally:
        await socket.close()
    return n
