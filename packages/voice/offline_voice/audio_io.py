from __future__ import annotations

import asyncio
import io
import os
import queue
import threading
import wave
from collections.abc import Iterator
from dataclasses import dataclass

import numpy as np

from .vad import FRAME_BYTES, SAMPLE_RATE


def _resample_int16(samples: np.ndarray, source_rate: int, target_rate: int) -> np.ndarray:
    if source_rate == target_rate or len(samples) == 0:
        return samples.astype(np.int16, copy=False)
    duration = len(samples) / source_rate
    target_len = max(1, int(duration * target_rate))
    source_x = np.linspace(0.0, duration, num=len(samples), endpoint=False)
    target_x = np.linspace(0.0, duration, num=target_len, endpoint=False)
    return np.interp(target_x, source_x, samples).astype(np.int16)


def read_wav_mono_pcm16(path: str, *, target_rate: int = SAMPLE_RATE) -> tuple[bytes, int]:
    with wave.open(path, "rb") as wav:
        channels = wav.getnchannels()
        sample_width = wav.getsampwidth()
        source_rate = wav.getframerate()
        frames = wav.readframes(wav.getnframes())

    if sample_width != 2:
        raise ValueError("Only 16-bit PCM WAV input is supported.")

    samples = np.frombuffer(frames, dtype=np.int16)
    if channels > 1:
        samples = samples.reshape(-1, channels).mean(axis=1).astype(np.int16)
    samples = _resample_int16(samples, source_rate, target_rate)
    return samples.tobytes(), target_rate


def iter_frames(pcm: bytes, *, frame_bytes: int = FRAME_BYTES) -> Iterator[bytes]:
    for offset in range(0, len(pcm) - frame_bytes + 1, frame_bytes):
        yield pcm[offset : offset + frame_bytes]


class Microphone:
    def __init__(self, *, sample_rate: int = SAMPLE_RATE, frame_bytes: int = FRAME_BYTES) -> None:
        self.sample_rate = sample_rate
        self.frame_bytes = frame_bytes
        self.device_name = "microfono predefinito"

    def _load_device_name(self) -> None:
        import sounddevice as sd

        try:
            device = sd.query_devices(kind="input")
        except Exception:
            return
        if isinstance(device, dict) and device.get("name"):
            self.device_name = str(device["name"])

    def frames(self) -> Iterator[bytes]:
        import sounddevice as sd

        audio_queue: queue.Queue[bytes] = queue.Queue()

        def callback(indata, frames, time, status) -> None:  # noqa: ANN001
            del frames, time
            if status:
                return
            audio_queue.put(bytes(indata))

        self._load_device_name()
        with sd.RawInputStream(
            samplerate=self.sample_rate,
            channels=1,
            dtype="int16",
            blocksize=self.frame_bytes // 2,
            callback=callback,
        ):
            while True:
                yield audio_queue.get()


@dataclass
class Speaker:
    sample_rate: int = SAMPLE_RATE

    def __post_init__(self) -> None:
        self._stop = threading.Event()

    def stop(self) -> None:
        self._stop.set()

    async def play_wav_bytes(self, wav_bytes: bytes) -> None:
        if os.getenv("OFFLINE_VOICE_NO_PLAYBACK") == "1":
            return
        self._stop.clear()
        await asyncio.to_thread(self._play_wav_bytes_sync, wav_bytes)

    def _play_wav_bytes_sync(self, wav_bytes: bytes) -> None:
        import sounddevice as sd

        with wave.open(io.BytesIO(wav_bytes), "rb") as wav:
            channels = wav.getnchannels()
            sample_width = wav.getsampwidth()
            sample_rate = wav.getframerate()
            if sample_width != 2:
                raise ValueError("Only 16-bit PCM WAV playback is supported.")

            with sd.RawOutputStream(samplerate=sample_rate, channels=channels, dtype="int16") as stream:
                while not self._stop.is_set():
                    chunk = wav.readframes(1024)
                    if not chunk:
                        break
                    stream.write(chunk)
