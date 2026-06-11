import pytest

from offline_voice.client import OfflineVoiceClient
from offline_voice.fsm import State
from offline_voice.reporter import ConsoleStatusReporter
from offline_voice.stt import FasterWhisperSTT


def test_console_status_reporter_prefixes_stdout(capsys) -> None:
    reporter = ConsoleStatusReporter()

    reporter("Hub connesso")

    captured = capsys.readouterr()
    assert captured.out == "[status] Hub connesso\n"
    assert captured.err == ""


def test_process_frames_reports_listening_and_final_transcript() -> None:
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)

    class Decision:
        def __init__(self, *, speech_started=False, in_speech=False, speech_ended=False) -> None:
            self.speech_started = speech_started
            self.in_speech = in_speech
            self.speech_ended = speech_ended

    decisions = [
        Decision(speech_started=True, in_speech=True),
        Decision(in_speech=True, speech_ended=True),
    ]
    client.vad.accept_frame = lambda _frame: decisions.pop(0)
    client.stt.transcribe_pcm16 = lambda _pcm, sample_rate, partial_callback: type(
        "Transcript",
        (),
        {"text": "ciao jarvis", "lang": "it"},
    )()

    client._process_frames_sync([b"a" * 8000, b"b" * 8000], 16000)

    assert "🎤 In ascolto..." in messages
    assert "🗣️  ciao jarvis" in messages


def test_process_frames_reports_listening_only_once_for_one_turn() -> None:
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)

    class Decision:
        def __init__(self, *, speech_started=False, in_speech=False, speech_ended=False) -> None:
            self.speech_started = speech_started
            self.in_speech = in_speech
            self.speech_ended = speech_ended

    decisions = [
        Decision(speech_started=True, in_speech=True),
        Decision(speech_started=True, in_speech=True),
        Decision(in_speech=True, speech_ended=True),
    ]
    client.vad.accept_frame = lambda _frame: decisions.pop(0)
    client.stt.transcribe_pcm16 = lambda _pcm, sample_rate, partial_callback: type(
        "Transcript",
        (),
        {"text": "ciao jarvis", "lang": "it"},
    )()

    client._process_frames_sync([b"a" * 8000, b"b" * 8000, b"c" * 8000], 16000)

    assert messages.count("🎤 In ascolto...") == 1


def test_process_frames_reports_discarded_too_short_segment() -> None:
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)

    class Decision:
        def __init__(self, *, speech_started=False, in_speech=False, speech_ended=False) -> None:
            self.speech_started = speech_started
            self.in_speech = in_speech
            self.speech_ended = speech_ended

    decisions = [
        Decision(speech_started=True, in_speech=True),
        Decision(in_speech=True, speech_ended=True),
    ]
    client.vad.accept_frame = lambda _frame: decisions.pop(0)
    client.stt.transcribe_pcm16 = lambda _pcm, sample_rate, partial_callback: type(
        "Transcript",
        (),
        {"text": "You", "lang": "en"},
    )()

    client._process_frames_sync([b"a", b"b"], 16000)

    assert "(segmento scartato: troppo breve)" in messages
    assert "🗣️  You" not in messages
    assert client.fsm.state == State.IDLE


def test_process_frames_reports_discarded_empty_transcript() -> None:
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)

    class Decision:
        def __init__(self, *, speech_started=False, in_speech=False, speech_ended=False) -> None:
            self.speech_started = speech_started
            self.in_speech = in_speech
            self.speech_ended = speech_ended

    decisions = [
        Decision(speech_started=True, in_speech=True),
        Decision(in_speech=True),
        Decision(in_speech=False, speech_ended=True),
    ]
    client.vad.accept_frame = lambda _frame: decisions.pop(0)
    client.stt.transcribe_pcm16 = lambda _pcm, sample_rate, partial_callback: type(
        "Transcript",
        (),
        {"text": "   ", "lang": "auto"},
    )()

    client._process_frames_sync([b"a" * 8000, b"b" * 8000, b"c" * 8000], 16000)

    assert "(segmento scartato: trascrizione vuota)" in messages
    assert not any(message.startswith("🗣️") for message in messages)
    assert client.fsm.state == State.IDLE


def test_short_speech_during_playback_does_not_open_capture_or_barge_in(monkeypatch) -> None:
    monkeypatch.setenv("OFFLINE_VOICE_BARGE_MS", "90")
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)
    stops = 0
    events: list[dict] = []

    def stop_playback() -> None:
        nonlocal stops
        stops += 1

    client.fsm._stop_playback = stop_playback
    client.fsm._emit_event = events.append
    client.fsm.tts_started()

    class Decision:
        speech_started = True
        speech_ended = False
        in_speech = True

    client.vad.accept_frame = lambda _frame: Decision()

    client._process_frames_sync([b"a", b"b"], 16000)

    assert stops == 0
    assert events == []
    assert messages == []
    assert client.fsm.state == State.SPEAKING


def test_sustained_speech_during_playback_triggers_barge_in(monkeypatch) -> None:
    monkeypatch.setenv("OFFLINE_VOICE_BARGE_MS", "60")
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)
    stops = 0
    events: list[dict] = []

    def stop_playback() -> None:
        nonlocal stops
        stops += 1

    client.fsm._stop_playback = stop_playback
    client.fsm._emit_event = events.append
    client.fsm.tts_started()

    class Decision:
        speech_started = False
        speech_ended = False
        in_speech = True

    client.vad.accept_frame = lambda _frame: Decision()

    client._process_frames_sync([b"a", b"b"], 16000)

    assert stops == 1
    assert events == [{"v": 1, "type": "barge_in"}]
    assert messages == ["🎤 In ascolto..."]
    assert client.fsm.state == State.LISTENING


def test_refractory_speaker_tail_does_not_become_segment(monkeypatch) -> None:
    monkeypatch.setenv("OFFLINE_VOICE_REFRACTORY_MS", "60")
    messages: list[str] = []
    client = OfflineVoiceClient(reporter=messages.append)
    transcribed = False

    class Decision:
        def __init__(self, *, in_speech=False, speech_ended=False) -> None:
            self.speech_started = False
            self.in_speech = in_speech
            self.speech_ended = speech_ended

    decisions = [
        Decision(in_speech=True),
        Decision(in_speech=True),
        Decision(in_speech=True),
        Decision(in_speech=True),
        Decision(speech_ended=True),
    ]
    client.vad.accept_frame = lambda _frame: decisions.pop(0)

    def transcribe(_pcm, sample_rate, partial_callback):
        nonlocal transcribed
        transcribed = True

    client.stt.transcribe_pcm16 = transcribe
    client._refractory_frames = 2

    client._process_frames_sync([b"a", b"b", b"c", b"d", b"e"], 16000)

    assert transcribed is False
    assert messages == []
    assert client.fsm.state == State.IDLE


def test_whisper_lazy_load_reports_start_and_ready(monkeypatch) -> None:
    messages: list[str] = []

    class FakeWhisperModel:
        def __init__(self, model_size: str, *, device: str, compute_type: str) -> None:
            self.model_size = model_size
            self.device = device
            self.compute_type = compute_type

    class FakeModule:
        WhisperModel = FakeWhisperModel

    monkeypatch.setitem(__import__("sys").modules, "faster_whisper", FakeModule())

    stt = FasterWhisperSTT(model_size="tiny", device="cpu", compute_type="int8", reporter=messages.append)

    assert stt.model.model_size == "tiny"
    assert messages == [
        "Whisper tiny in caricamento lazy (device=cpu, compute=int8)...",
        "Whisper tiny pronto",
    ]


def test_whisper_language_env_is_passed_to_faster_whisper(monkeypatch) -> None:
    calls: list[dict] = []

    class Info:
        language = "it"

    class FakeModel:
        def transcribe(self, _path: str, **kwargs):
            calls.append(kwargs)
            return [], Info()

    monkeypatch.setenv("WHISPER_LANGUAGE", "it")
    stt = FasterWhisperSTT(model_size="tiny", device="cpu", compute_type="int8")
    stt._model = FakeModel()

    stt.transcribe_pcm16(b"\0" * 32000, sample_rate=16000)

    assert calls[0]["language"] == "it"


@pytest.mark.asyncio
async def test_microphone_permission_error_reports_friendly_message() -> None:
    messages: list[str] = []

    class DeniedMicrophone:
        sample_rate = 16000
        device_name = "MacBook Pro Microphone"

        def frames(self):
            class PortAudioError(Exception):
                pass

            raise PortAudioError("Error opening RawInputStream: Invalid input device")
            yield b""

    client = OfflineVoiceClient(reporter=messages.append, microphone_factory=DeniedMicrophone)

    with pytest.raises(SystemExit) as exc:
        await client.run_microphone()

    assert exc.value.code == 1
    assert any("permesso Microfono" in message for message in messages)
    assert any("Impostazioni -> Privacy e Sicurezza -> Microfono" in message for message in messages)
