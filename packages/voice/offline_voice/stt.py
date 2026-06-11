from __future__ import annotations

import os
import tempfile
import wave
from collections.abc import Callable
from dataclasses import dataclass

import numpy as np

SUPPORTED_LANGS = {"it", "en", "de", "fr"}
DEFAULT_MODEL_SIZE = "small"


def map_whisper_language(language: str | None) -> str:
    if language in SUPPORTED_LANGS:
        return language
    return "auto"


@dataclass(frozen=True)
class Transcript:
    text: str
    lang: str


class FasterWhisperSTT:
    """Lazy faster-whisper wrapper.

    The model is loaded on first transcription so tests and process startup never
    download or initialize ML assets unless STT is actually used.
    """

    def __init__(self, model_size: str | None = None, *, device: str | None = None, compute_type: str | None = None) -> None:
        self.model_size = model_size or os.getenv("WHISPER_MODEL", DEFAULT_MODEL_SIZE)
        self.device = device or os.getenv("WHISPER_DEVICE", "auto")
        self.compute_type = compute_type or os.getenv("WHISPER_COMPUTE_TYPE", "int8")
        self._model = None

    @property
    def model(self):
        if self._model is None:
            from faster_whisper import WhisperModel

            self._model = WhisperModel(self.model_size, device=self.device, compute_type=self.compute_type)
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

            segments, info = self.model.transcribe(
                audio_file.name,
                vad_filter=False,
                beam_size=1,
                condition_on_previous_text=False,
            )
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

