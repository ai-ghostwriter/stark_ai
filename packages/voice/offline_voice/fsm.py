from __future__ import annotations

from collections.abc import Callable
from enum import Enum
from typing import Any


class State(str, Enum):
    IDLE = "IDLE"
    LISTENING = "LISTENING"
    TRANSCRIBING = "TRANSCRIBING"
    WAITING = "WAITING"
    SPEAKING = "SPEAKING"


class ConversationFSM:
    """Pure conversation state machine for offline voice turn-taking."""

    def __init__(
        self,
        *,
        emit_event: Callable[[dict[str, Any]], None],
        stop_playback: Callable[[], None],
    ) -> None:
        self.state = State.IDLE
        self._emit_event = emit_event
        self._stop_playback = stop_playback

    def speech_started(self) -> None:
        if self.state == State.SPEAKING:
            self._stop_playback()
            self._emit_event({"v": 1, "type": "barge_in"})
            self.state = State.LISTENING
            return

        if self.state in {State.IDLE, State.LISTENING}:
            self.state = State.LISTENING

    def speech_ended(self) -> None:
        if self.state == State.LISTENING:
            self.state = State.TRANSCRIBING

    def transcript_partial(self, text: str) -> None:
        text = text.strip()
        if not text:
            return
        self._emit_event({"v": 1, "type": "stt.partial", "text": text})

    def transcript_final(self, text: str, lang: str = "auto") -> None:
        text = text.strip()
        if not text:
            self.state = State.IDLE
            return
        self._emit_event({"v": 1, "type": "stt.final", "text": text, "lang": lang})
        self.state = State.WAITING

    def tts_started(self) -> None:
        self.state = State.SPEAKING

    def tts_finished(self) -> None:
        if self.state == State.SPEAKING:
            self.state = State.IDLE

    def tts_cancelled(self) -> None:
        self._stop_playback()
        if self.state == State.SPEAKING:
            self.state = State.IDLE

