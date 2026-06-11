import pytest

from offline_voice.client import OfflineVoiceClient
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

    client._process_frames_sync([b"a", b"b"], 16000)

    assert "🎤 In ascolto..." in messages
    assert "🗣️  ciao jarvis" in messages


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
