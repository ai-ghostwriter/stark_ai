from __future__ import annotations

import argparse
import asyncio
import json
import math
import os
import sys
from collections.abc import Awaitable, Callable
from typing import Any

import websockets
from pydantic import ValidationError

from contracts_gen import Event
from contracts_gen.events import AgentDone, AgentToken, RouteInfo, SysError, TtsCancel, TtsSpeak

from .audio_io import Microphone, Speaker, iter_frames, read_wav_mono_pcm16
from .fsm import ConversationFSM, State
from .reporter import StatusReporter, coerce_reporter
from .stt import FasterWhisperSTT, should_emit_transcript
from .tts import KOKORO_DEFAULT_URL, KokoroTTS
from .vad import FRAME_MS, SAMPLE_WIDTH_BYTES, WebRtcVad

DEFAULT_URL = "ws://127.0.0.1:7710"
CLIENT_NAME = "offline-voice@0.1"
CONNECT_ATTEMPTS = 20
CONNECT_RETRY_SECONDS = 0.2
KOKORO_CHECK_TIMEOUT = 2.0
DEFAULT_BARGE_MS = 400
DEFAULT_REFRACTORY_MS = 300


def parse_incoming_message(raw: str) -> Event:
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON: {exc}") from exc
    try:
        return Event.model_validate(payload)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc


async def open_connection(
    url: str,
    *,
    connect: Callable[[str], Awaitable[Any]] = websockets.connect,
    attempts: int = CONNECT_ATTEMPTS,
    delay_seconds: float = CONNECT_RETRY_SECONDS,
) -> Any:
    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            return await connect(url)
        except OSError as exc:
            last_error = exc
            if attempt == attempts - 1:
                break
            await asyncio.sleep(delay_seconds)
    if last_error is not None:
        raise last_error
    raise ConnectionError("Could not connect to hub.")


async def kokoro_is_reachable(base_url: str = KOKORO_DEFAULT_URL) -> bool:
    import httpx

    url = f"{base_url.rstrip('/')}/v1/models"
    try:
        async with httpx.AsyncClient(timeout=KOKORO_CHECK_TIMEOUT) as client:
            response = await client.get(url)
        return response.status_code < 500
    except Exception:
        return False


class OfflineVoiceClient:
    def __init__(
        self,
        *,
        url: str = DEFAULT_URL,
        wav_path: str | None = None,
        reporter: StatusReporter | Callable[[str], None] | None = None,
        microphone_factory: Callable[[], Microphone] = Microphone,
        kokoro_checker: Callable[[str], Awaitable[bool]] = kokoro_is_reachable,
    ) -> None:
        self.url = url
        self.wav_path = wav_path
        self.report = coerce_reporter(reporter)
        self.microphone_factory = microphone_factory
        self.kokoro_checker = kokoro_checker
        self.socket: Any | None = None
        self.outbox: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.speaker = Speaker()
        self.tts = KokoroTTS(warn=self.warn)
        self.stt = FasterWhisperSTT(reporter=self.report)
        self.vad = WebRtcVad()
        self.fsm = ConversationFSM(emit_event=self.emit_event, stop_playback=self.speaker.stop)
        self._utterance = bytearray()
        self._barge_speech_frames = 0
        self._refractory_frames = 0
        self._barge_frames = self._frames_from_env("OFFLINE_VOICE_BARGE_MS", DEFAULT_BARGE_MS)
        self._refractory_window_frames = self._frames_from_env(
            "OFFLINE_VOICE_REFRACTORY_MS",
            DEFAULT_REFRACTORY_MS,
        )

    def warn(self, message: str) -> None:
        print(f"[warn] {message}", file=sys.stderr, flush=True)

    def emit_event(self, event: dict[str, Any]) -> None:
        self.outbox.put_nowait(event)

    @staticmethod
    def _frames_from_env(name: str, default_ms: int) -> int:
        return max(1, math.ceil(int(os.getenv(name, str(default_ms))) / FRAME_MS))

    @staticmethod
    def _segment_duration_seconds(pcm: bytes, sample_rate: int) -> float:
        return len(pcm) / (sample_rate * SAMPLE_WIDTH_BYTES)

    def _enter_listening(self) -> None:
        previous_state = self.fsm.state
        self.fsm.speech_started()
        if self.fsm.state == State.LISTENING and previous_state != State.LISTENING:
            self.report("🎤 In ascolto...")

    def _finish_utterance(self, sample_rate: int) -> None:
        if not self._utterance:
            return

        pcm = bytes(self._utterance)
        self._utterance.clear()
        self.fsm.speech_ended()
        transcript = self.stt.transcribe_pcm16(
            pcm,
            sample_rate=sample_rate,
            partial_callback=self.fsm.transcript_partial,
        )
        decision = should_emit_transcript(
            transcript.text,
            duration_seconds=self._segment_duration_seconds(pcm, sample_rate),
        )
        if not decision.emit:
            if decision.reason is not None:
                self.report(f"(segmento scartato: {decision.reason.value})")
            self.fsm.transcript_final("", transcript.lang)
            return

        text = transcript.text.strip()
        self.report(f"🗣️  {text}")
        self.fsm.transcript_final(text, transcript.lang)

    def _handle_speaking_frame(self, decision: Any) -> bool:
        if decision.in_speech:
            self._barge_speech_frames += 1
            if self._barge_speech_frames >= self._barge_frames:
                self._barge_speech_frames = 0
                self._enter_listening()
                return False
            return True

        self._barge_speech_frames = 0
        return True

    async def sender(self) -> None:
        while True:
            event = await self.outbox.get()
            if self.socket is None:
                continue
            await self.socket.send(json.dumps(event))

    async def receiver(self) -> None:
        assert self.socket is not None
        async for raw in self.socket:
            try:
                event = parse_incoming_message(raw).root
            except ValueError as exc:
                self.warn(f"Dropped invalid event: {exc}")
                continue

            if isinstance(event, TtsSpeak):
                self.fsm.tts_started()
                try:
                    self.report(f"🔊 {event.text}")
                    await self.tts.speak(event.text, persona=event.persona, voice=event.voice, player=self.speaker)
                except Exception as exc:
                    self.warn(f"TTS playback failed: {exc}")
                finally:
                    self.fsm.tts_finished()
                    self._refractory_frames = self._refractory_window_frames
            elif isinstance(event, TtsCancel):
                self.fsm.tts_cancelled()
                self._refractory_frames = self._refractory_window_frames
            elif isinstance(event, (AgentToken, AgentDone, RouteInfo, SysError)):
                continue
            else:
                self.warn(f"Dropped unsupported inbound event: {event.type}")

    def _process_frames_sync(self, frames: list[bytes], sample_rate: int, *, flush: bool = False) -> None:
        for frame in frames:
            decision = self.vad.accept_frame(frame)
            if self.fsm.state == State.SPEAKING and self._handle_speaking_frame(decision):
                continue
            if self._refractory_frames > 0:
                self._refractory_frames -= 1
                continue
            if decision.speech_started:
                self._utterance.clear()
                self._enter_listening()
            if decision.in_speech and self.fsm.state == State.LISTENING:
                self._utterance.extend(frame)
            if decision.speech_ended and self.fsm.state == State.LISTENING:
                self._finish_utterance(sample_rate)

        if flush and self._utterance and self.fsm.state == State.LISTENING:
            self._finish_utterance(sample_rate)

    async def run_wav(self, path: str) -> None:
        self.report(f"Input WAV: {path}")
        pcm, sample_rate = read_wav_mono_pcm16(path)
        self._process_frames_sync(list(iter_frames(pcm)), sample_rate, flush=True)

    async def run_microphone(self) -> None:
        mic = self.microphone_factory()
        try:
            frames = mic.frames()
            for frame in frames:
                self.report(f"Microfono aperto: {getattr(mic, 'device_name', 'microfono predefinito')}")
                self._process_frames_sync([frame], mic.sample_rate)
                break
            for frame in frames:
                self._process_frames_sync([frame], mic.sample_rate)
                await asyncio.sleep(0)
        except Exception as exc:
            if isinstance(exc, (PermissionError, OSError)) or exc.__class__.__name__ == "PortAudioError":
                self.report(
                    "Errore microfono: controlla il permesso Microfono per questa app Terminale. "
                    "Apri Impostazioni -> Privacy e Sicurezza -> Microfono e abilita Terminal/iTerm/VS Code, "
                    "poi riavvia `make dev-voice`."
                )
                raise SystemExit(1) from None
            raise

    async def run(self) -> None:
        self.report(f"VAD attivo: WebRTC {self.vad.sample_rate} Hz")
        self.report(
            f"Whisper {self.stt.model_size} pronto al caricamento lazy "
            f"(device={self.stt.device}, compute={self.stt.compute_type})"
        )
        if await self.kokoro_checker(self.tts.base_url or KOKORO_DEFAULT_URL):
            self.report(f"Kokoro raggiungibile: {self.tts.base_url}")
        else:
            self.report("Kokoro non raggiungibile: le risposte saranno mute finché il TTS non sarà pronto")
        self.socket = await open_connection(self.url)
        try:
            await self.socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": CLIENT_NAME}))
            self.report(f"Hub connesso: {self.url}")
            tasks = [asyncio.create_task(self.sender()), asyncio.create_task(self.receiver())]
            if self.wav_path:
                await self.run_wav(self.wav_path)
                await asyncio.sleep(5)
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
            else:
                tasks.append(asyncio.create_task(self.run_microphone()))
                await asyncio.gather(*tasks)
        finally:
            await self.socket.close()


async def run(url: str = DEFAULT_URL, *, wav_path: str | None = None) -> None:
    await OfflineVoiceClient(url=url, wav_path=wav_path).run()


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(description="STARK-AI real offline voice client.")
    parser.add_argument("--url", default=DEFAULT_URL, help="Hub WebSocket URL.")
    parser.add_argument("--wav", help="Feed a WAV file through VAD + STT instead of the microphone.")
    args = parser.parse_args(argv)
    try:
        asyncio.run(run(args.url, wav_path=args.wav))
    except KeyboardInterrupt:
        return
