from offline_voice.vad import FRAME_BYTES, WebRtcVad


def test_vad_requires_configured_consecutive_speech_frames_before_starting() -> None:
    speech_flags = iter([False, True, False, True, True, True])
    vad = WebRtcVad(is_speech=lambda _frame, _rate: next(speech_flags), start_frames=3, end_frames=2)

    decisions = [vad.accept_frame(b"\0" * FRAME_BYTES) for _ in range(6)]

    assert [decision.speech_started for decision in decisions] == [False, False, False, False, False, True]
    assert decisions[-1].in_speech is True


def test_vad_waits_for_configured_silence_hangover_before_ending() -> None:
    speech_flags = iter([True, True, False, False, True, False, False])
    vad = WebRtcVad(is_speech=lambda _frame, _rate: next(speech_flags), start_frames=2, end_frames=2)

    decisions = [vad.accept_frame(b"\0" * FRAME_BYTES) for _ in range(7)]

    assert decisions[1].speech_started is True
    assert decisions[2].speech_ended is False
    assert decisions[3].speech_ended is True
    assert decisions[6].speech_ended is False
