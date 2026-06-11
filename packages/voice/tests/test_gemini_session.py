import pytest

import agent


class FakeRoom:
    pass


class FakeContext:
    room = FakeRoom()


class FakeAgentSession:
    created = []

    def __init__(self, *args, **kwargs):
        self.started_with = None
        FakeAgentSession.created.append(self)

    async def start(self, **kwargs):
        self.started_with = kwargs


class FakeRealtimeModel:
    created_kwargs = []

    def __init__(self, **kwargs):
        FakeRealtimeModel.created_kwargs.append(kwargs)


class FakeAudioTranscriptionConfig:
    created_kwargs = []

    def __init__(self, **kwargs):
        self.language_codes = kwargs.get("language_codes")
        FakeAudioTranscriptionConfig.created_kwargs.append(kwargs)


@pytest.mark.asyncio
async def test_gemini_session_requests_output_audio_transcription(monkeypatch) -> None:
    FakeAgentSession.created.clear()
    FakeRealtimeModel.created_kwargs.clear()
    FakeAudioTranscriptionConfig.created_kwargs.clear()

    monkeypatch.setattr(agent, "AgentSession", FakeAgentSession)
    monkeypatch.setattr(agent.google.beta.realtime, "RealtimeModel", FakeRealtimeModel)
    monkeypatch.setattr(agent.types, "AudioTranscriptionConfig", FakeAudioTranscriptionConfig)

    async def fake_resolve_session_tools() -> list:
        return []

    monkeypatch.setattr(agent, "resolve_session_tools", fake_resolve_session_tools)

    session = await agent.start_gemini_session(FakeContext(), {"persona": "jarvis"})

    assert session is FakeAgentSession.created[0]
    assert FakeRealtimeModel.created_kwargs[0]["voice"] == "Fenrir"
    transcription_config = FakeRealtimeModel.created_kwargs[0]["output_audio_transcription"]
    assert isinstance(transcription_config, FakeAudioTranscriptionConfig)
    assert transcription_config.language_codes is None
    assert FakeAudioTranscriptionConfig.created_kwargs == [{}]
