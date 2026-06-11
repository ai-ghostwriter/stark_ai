from __future__ import annotations

import math
import os
from collections.abc import Callable
from dataclasses import dataclass

FRAME_MS = 30
SAMPLE_RATE = 16_000
SAMPLE_WIDTH_BYTES = 2
FRAME_BYTES = int(SAMPLE_RATE * FRAME_MS / 1000) * SAMPLE_WIDTH_BYTES
DEFAULT_AGGRESSIVENESS = 2
DEFAULT_SPEECH_START_MS = 200
DEFAULT_SPEECH_END_MS = 700


@dataclass
class VadDecision:
    speech_started: bool = False
    speech_ended: bool = False
    in_speech: bool = False


class WebRtcVad:
    """Small CPU-friendly VAD wrapper around WebRTC VAD."""

    def __init__(
        self,
        aggressiveness: int | None = None,
        *,
        start_frames: int | None = None,
        end_frames: int | None = None,
        is_speech: Callable[[bytes, int], bool] | None = None,
    ) -> None:
        if aggressiveness is None:
            aggressiveness = int(os.getenv("OFFLINE_VOICE_VAD_AGGRESSIVENESS", str(DEFAULT_AGGRESSIVENESS)))
        if start_frames is None:
            start_ms = int(os.getenv("OFFLINE_VOICE_SPEECH_START_MS", str(DEFAULT_SPEECH_START_MS)))
            start_frames = max(1, math.ceil(start_ms / FRAME_MS))
        if end_frames is None:
            end_ms = int(os.getenv("OFFLINE_VOICE_SPEECH_END_MS", str(DEFAULT_SPEECH_END_MS)))
            end_frames = max(1, math.ceil(end_ms / FRAME_MS))

        self.sample_rate = SAMPLE_RATE
        self.frame_ms = FRAME_MS
        self.frame_bytes = FRAME_BYTES
        if is_speech is None:
            import webrtcvad

            vad = webrtcvad.Vad(aggressiveness)
            self._is_speech = vad.is_speech
        else:
            self._is_speech = is_speech
        self._start_frames = start_frames
        self._end_frames = end_frames
        self._speech_count = 0
        self._silence_count = 0
        self._in_speech = False

    def accept_frame(self, frame: bytes) -> VadDecision:
        if len(frame) != self.frame_bytes:
            raise ValueError(f"Expected {self.frame_bytes} bytes per VAD frame, got {len(frame)}.")

        is_speech = self._is_speech(frame, self.sample_rate)
        started = False
        ended = False

        if is_speech:
            self._speech_count += 1
            self._silence_count = 0
            if not self._in_speech and self._speech_count >= self._start_frames:
                self._in_speech = True
                started = True
        else:
            self._silence_count += 1
            self._speech_count = 0
            if self._in_speech and self._silence_count >= self._end_frames:
                self._in_speech = False
                ended = True

        return VadDecision(speech_started=started, speech_ended=ended, in_speech=self._in_speech)
