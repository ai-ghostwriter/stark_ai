"""Tests for the dynamic LiveKit tools backed by the core unified registry."""
import json

import pytest

from core_tools import build_core_tool, load_core_tools


SAMPLE_DEFS = [
    {
        "name": "weather_report",
        "description": "Current weather for a city.",
        "parameters": {"type": "object", "properties": {"city": {"type": "string"}}, "required": ["city"]},
    },
    {
        "name": "open_app",
        "description": "Open an application by name.",
        "parameters": {"type": "object", "properties": {"app": {"type": "string"}}, "required": ["app"]},
    },
]


@pytest.mark.asyncio
async def test_load_builds_one_tool_per_definition() -> None:
    async def fetcher(url: str) -> list[dict]:
        assert url.endswith("/tools")
        return SAMPLE_DEFS

    tools = await load_core_tools("http://core:8787", fetcher=fetcher)
    assert len(tools) == 2


@pytest.mark.asyncio
async def test_load_falls_back_to_empty_on_fetch_error() -> None:
    async def fetcher(url: str) -> list[dict]:
        raise ConnectionError("core down")

    tools = await load_core_tools("http://core:8787", fetcher=fetcher)
    assert tools == []


@pytest.mark.asyncio
async def test_tool_handler_posts_to_tools_call_and_returns_data() -> None:
    calls: list[tuple[str, dict]] = []

    async def caller(url: str, payload: dict) -> dict:
        calls.append((url, payload))
        return {"ok": True, "data": {"temp": 21}}

    tool = build_core_tool(SAMPLE_DEFS[0], "http://core:8787", caller=caller)
    handler = getattr(tool, "__wrapped_core_handler__")
    result = await handler({"city": "Milano"})

    assert calls == [("http://core:8787/tools/call", {"name": "weather_report", "args": {"city": "Milano"}})]
    assert json.loads(result) == {"temp": 21}


@pytest.mark.asyncio
async def test_tool_handler_surfaces_structured_errors_as_text() -> None:
    async def caller(url: str, payload: dict) -> dict:
        return {"ok": False, "error": {"code": "TOOL_TIMEOUT", "message": "timed out"}}

    tool = build_core_tool(SAMPLE_DEFS[0], "http://core:8787", caller=caller)
    handler = getattr(tool, "__wrapped_core_handler__")
    result = await handler({"city": "Milano"})

    assert "TOOL_TIMEOUT" in result and "timed out" in result
