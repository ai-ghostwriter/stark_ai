from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Awaitable, Callable
from typing import Any

import websockets
from pydantic import ValidationError

from contracts_gen import Event
from contracts_gen.events import AgentDone, AgentToken, RouteInfo, SysError, TtsCancel, TtsSpeak

from .audio_io import Microphone, Speaker, iter_frames, read_wav_mono_pcm16
from .fsm import ConversationFSM, State
from .stt import FasterWhisperSTT
from .tts import KokoroTTS
from .vad import WebRtcVad

DEFAULT_URL = "ws://127.0.0.1:7710"
CLIENT_NAME = "offline-voice@0.1"
CONNECT_ATTEMPTS = 20
CONNECT_RETRY_SECONDS = 0.2


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


class OfflineVoiceClient:
    def __init__(self, *, url: str = DEFAULT_URL, wav_path: str | None = None) -> None:
        self.url = url
        self.wav_path = wav_path
        self.socket: Any | None = None
        self.outbox: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
        self.speaker = Speaker()
        self.tts = KokoroTTS(warn=self.warn)
        self.stt = FasterWhisperSTT()
        self.vad = WebRtcVad()
        self.fsm = ConversationFSM(emit_event=self.emit_event, stop_playback=self.speaker.stop)

    def warn(self, message: str) -> None:
        print(f"[warn] {message}", file=sys.stderr, flush=True)

    def emit_event(self, event: dict[str, Any]) -> None:
        self.outbox.put_nowait(event)

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
                    await self.tts.speak(event.text, persona=event.persona, voice=event.voice, player=self.speaker)
                except Exception as exc:
                    self.warn(f"TTS playback failed: {exc}")
                finally:
                    self.fsm.tts_finished()
            elif isinstance(event, TtsCancel):
                self.fsm.tts_cancelled()
            elif isinstance(event, (AgentToken, AgentDone, RouteInfo, SysError)):
                continue
            else:
                self.warn(f"Dropped unsupported inbound event: {event.type}")

    def _process_frames_sync(self, frames: list[bytes], sample_rate: int) -> None:
        utterance = bytearray()
        for frame in frames:
            decision = self.vad.accept_frame(frame)
            if decision.speech_started:
                utterance.clear()
                self.fsm.speech_started()
            if decision.in_speech:
                utterance.extend(frame)
            if decision.speech_ended and utterance:
                self.fsm.speech_ended()
                transcript = self.stt.transcribe_pcm16(
                    bytes(utterance),
                    sample_rate=sample_rate,
                    partial_callback=self.fsm.transcript_partial,
                )
                self.fsm.transcript_final(transcript.text, transcript.lang)
                utterance.clear()

        if utterance and self.fsm.state == State.LISTENING:
            self.fsm.speech_ended()
            transcript = self.stt.transcribe_pcm16(
                bytes(utterance),
                sample_rate=sample_rate,
                partial_callback=self.fsm.transcript_partial,
            )
            self.fsm.transcript_final(transcript.text, transcript.lang)

    async def run_wav(self, path: str) -> None:
        pcm, sample_rate = read_wav_mono_pcm16(path)
        self._process_frames_sync(list(iter_frames(pcm)), sample_rate)

    async def run_microphone(self) -> None:
        mic = Microphone()
        for frame in mic.frames():
            self._process_frames_sync([frame], mic.sample_rate)
            await asyncio.sleep(0)

    async def run(self) -> None:
        self.socket = await open_connection(self.url)
        try:
            await self.socket.send(json.dumps({"v": 1, "type": "hello", "role": "voice", "client": CLIENT_NAME}))
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
