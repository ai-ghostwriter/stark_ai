from __future__ import annotations

import os
import tempfile
import wave
from collections.abc import Callable
from dataclasses import dataclass
from enum import Enum

import numpy as np

SUPPORTED_LANGS = {"it", "en", "de", "fr"}
DEFAULT_MODEL_SIZE = "small"
DEFAULT_MIN_SPEECH_SECONDS = 0.4
HALLUCINATION_BLACKLIST = {
    "...",
    "grazie",
    "sottotitoli e revisione a cura di qtss",
    "thank you",
    "thanks",
    "you",
}


def map_whisper_language(language: str | None) -> str:
    if language in SUPPORTED_LANGS:
        return language
    return "auto"


@dataclass(frozen=True)
class Transcript:
    text: str
    lang: str


class TranscriptDiscardReason(str, Enum):
    TOO_SHORT = "troppo breve"
    EMPTY = "trascrizione vuota"
    TOO_SHORT_TEXT = "trascrizione vuota"
    HALLUCINATION = "trascrizione vuota"


@dataclass(frozen=True)
class TranscriptDecision:
    emit: bool
    reason: TranscriptDiscardReason | None = None


def get_min_speech_seconds() -> float:
    return float(os.getenv("OFFLINE_VOICE_MIN_SPEECH_S", str(DEFAULT_MIN_SPEECH_SECONDS)))


def should_emit_transcript(
    text: str,
    *,
    duration_seconds: float,
    min_speech_seconds: float | None = None,
) -> TranscriptDecision:
    if min_speech_seconds is None:
        min_speech_seconds = get_min_speech_seconds()
    if duration_seconds < min_speech_seconds:
        return TranscriptDecision(False, TranscriptDiscardReason.TOO_SHORT)

    normalized = " ".join(text.strip().lower().split())
    if not normalized:
        return TranscriptDecision(False, TranscriptDiscardReason.EMPTY)
    if len(normalized) < 3:
        return TranscriptDecision(False, TranscriptDiscardReason.TOO_SHORT_TEXT)
    if normalized in HALLUCINATION_BLACKLIST:
        return TranscriptDecision(False, TranscriptDiscardReason.HALLUCINATION)
    return TranscriptDecision(True)


class FasterWhisperSTT:
    """Lazy faster-whisper wrapper.

    The model is loaded on first transcription so tests and process startup never
    download or initialize ML assets unless STT is actually used.
    """

    def __init__(
        self,
        model_size: str | None = None,
        *,
        device: str | None = None,
        compute_type: str | None = None,
        reporter: Callable[[str], None] | None = None,
    ) -> None:
        self.model_size = model_size or os.getenv("WHISPER_MODEL", DEFAULT_MODEL_SIZE)
        self.device = device or os.getenv("WHISPER_DEVICE", "auto")
        self.compute_type = compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        self.language = os.getenv("WHISPER_LANGUAGE") or None
        self.reporter = reporter
        self._model = None

    @property
    def model(self):
        if self._model is None:
            if self.reporter is not None:
                self.reporter(
                    f"Whisper {self.model_size} in caricamento lazy "
                    f"(device={self.device}, compute={self.compute_type})..."
                )
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
            if self.reporter is not None:
                self.reporter(f"Whisper {self.model_size} pronto")
        return self._model

    def transcribe_pcm16(
        self,
        pcm: bytes,
        *,
        sample_rate: int,
        partial_callback: Callable[[str], None] | None = None,
    ) -> Transcript:
        with tempfile.NamedTemporaryFile(suffix=".wav") as audio_file:
            with wave.open(audio_file.name, "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(sample_rate)
                wav.writeframes(pcm)

            kwargs = {
                "vad_filter": False,
                "beam_size": 1,
                "condition_on_previous_text": False,
            }
            if self.language:
                kwargs["language"] = self.language
            segments, info = self.model.transcribe(audio_file.name, **kwargs)
            texts: list[str] = []
            for segment in segments:
                text = segment.text.strip()
                if not text:
                    continue
                texts.append(text)
                if partial_callback is not None:
                    partial_callback(" ".join(texts).strip())

        return Transcript(text=" ".join(texts).strip(), lang=map_whisper_language(getattr(info, "language", None)))


def pcm16_bytes_to_float32(pcm: bytes) -> np.ndarray:
    return np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
