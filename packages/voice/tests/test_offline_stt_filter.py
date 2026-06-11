from offline_voice.stt import TranscriptDiscardReason, should_emit_transcript


def test_transcript_filter_discards_too_short_segments() -> None:
    decision = should_emit_transcript("ciao", duration_seconds=0.39, min_speech_seconds=0.4)

    assert decision.emit is False
    assert decision.reason == TranscriptDiscardReason.TOO_SHORT


def test_transcript_filter_discards_empty_and_tiny_text() -> None:
    assert should_emit_transcript("   ", duration_seconds=1.0).reason == TranscriptDiscardReason.EMPTY
    assert should_emit_transcript("ok", duration_seconds=1.0).reason == TranscriptDiscardReason.TOO_SHORT_TEXT


def test_transcript_filter_discards_known_whisper_hallucinations_case_insensitive() -> None:
    decision = should_emit_transcript("  Thank You  ", duration_seconds=1.0)

    assert decision.emit is False
    assert decision.reason == TranscriptDiscardReason.HALLUCINATION


def test_transcript_filter_accepts_real_transcript() -> None:
    decision = should_emit_transcript("ciao jarvis", duration_seconds=1.0)

    assert decision.emit is True
    assert decision.reason is None
