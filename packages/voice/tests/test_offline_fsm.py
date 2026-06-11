from offline_voice.fsm import ConversationFSM, State


class Recorder:
    def __init__(self) -> None:
        self.events: list[dict] = []
        self.stops = 0

    def emit(self, event: dict) -> None:
        self.events.append(event)

    def stop_playback(self) -> None:
        self.stops += 1


def test_happy_path_transitions_from_listening_to_speaking() -> None:
    recorder = Recorder()
    fsm = ConversationFSM(emit_event=recorder.emit, stop_playback=recorder.stop_playback)

    assert fsm.state == State.IDLE

    fsm.speech_started()
    assert fsm.state == State.LISTENING

    fsm.speech_ended()
    assert fsm.state == State.TRANSCRIBING

    fsm.transcript_final("ciao jarvis", "it")
    assert fsm.state == State.WAITING
    assert recorder.events == [{"v": 1, "type": "stt.final", "text": "ciao jarvis", "lang": "it"}]

    fsm.tts_started()
    assert fsm.state == State.SPEAKING

    fsm.tts_finished()
    assert fsm.state == State.IDLE


def test_partial_transcripts_are_emitted_without_leaving_transcribing() -> None:
    recorder = Recorder()
    fsm = ConversationFSM(emit_event=recorder.emit, stop_playback=recorder.stop_playback)

    fsm.speech_started()
    fsm.speech_ended()
    fsm.transcript_partial("ciao")

    assert fsm.state == State.TRANSCRIBING
    assert recorder.events == [{"v": 1, "type": "stt.partial", "text": "ciao"}]


def test_barge_in_during_speaking_stops_playback_and_emits_event() -> None:
    recorder = Recorder()
    fsm = ConversationFSM(emit_event=recorder.emit, stop_playback=recorder.stop_playback)

    fsm.tts_started()
    fsm.speech_started()

    assert recorder.stops == 1
    assert recorder.events == [{"v": 1, "type": "barge_in"}]
    assert fsm.state == State.LISTENING


def test_speech_during_listening_does_not_emit_barge_in() -> None:
    recorder = Recorder()
    fsm = ConversationFSM(emit_event=recorder.emit, stop_playback=recorder.stop_playback)

    fsm.speech_started()
    fsm.speech_started()

    assert recorder.stops == 0
    assert recorder.events == []
    assert fsm.state == State.LISTENING

