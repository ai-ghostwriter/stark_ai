from __future__ import annotations

from dataclasses import dataclass

FRAME_MS = 30
SAMPLE_RATE = 16_000
SAMPLE_WIDTH_BYTES = 2
FRAME_BYTES = int(SAMPLE_RATE * FRAME_MS / 1000) * SAMPLE_WIDTH_BYTES


@dataclass
class VadDecision:
    speech_started: bool = False
    speech_ended: bool = False
    in_speech: bool = False


class WebRtcVad:
    """Small CPU-friendly VAD wrapper around WebRTC VAD."""

    def __init__(self, aggressiveness: int = 2, *, start_frames: int = 3, end_frames: int = 12) -> None:
        import webrtcvad

        self.sample_rate = SAMPLE_RATE
        self.frame_ms = FRAME_MS
        self.frame_bytes = FRAME_BYTES
        self._vad = webrtcvad.Vad(aggressiveness)
        self._start_frames = start_frames
        self._end_frames = end_frames
        self._speech_count = 0
        self._silence_count = 0
        self._in_speech = False

    def accept_frame(self, frame: bytes) -> VadDecision:
        if len(frame) != self.frame_bytes:
            raise ValueError(f"Expected {self.frame_bytes} bytes per VAD frame, got {len(frame)}.")

        is_speech = self._vad.is_speech(frame, self.sample_rate)
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

