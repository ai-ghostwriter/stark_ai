"""Dynamic LiveKit function tools backed by the core unified tool registry.

The core (packages/core) exposes the full tool plane over HTTP:
GET /tools lists every registry tool schema; POST /tools/call dispatches one.
Every LiveKit pipeline (gemini/gpt) builds its function tools from that single
source of truth, so all front-doors see the same fleet.
"""
from __future__ import annotations

import json
import logging
from collections.abc import Awaitable, Callable
from typing import Any

from livekit.agents import function_tool

logger = logging.getLogger("core-tools")

Fetcher = Callable[[str], Awaitable[list[dict]]]
Caller = Callable[[str, dict], Awaitable[dict]]

DEFAULT_TIMEOUT_S = 15.0


async def _http_fetch_tools(url: str) -> list[dict]:
    import httpx

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_S) as client:
        response = await client.get(url)
        response.raise_for_status()
        payload = response.json()
        return payload.get("tools", [])


async def _http_call_tool(url: str, payload: dict) -> dict:
    import httpx

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(url, json=payload)
        return response.json()


def build_core_tool(definition: dict, core_url: str, *, caller: Caller | None = None):
    """Wrap one core registry tool definition as a LiveKit raw function tool."""
    name = definition["name"]
    call = caller or _http_call_tool
    call_url = f"{core_url.rstrip('/')}/tools/call"

    async def handler(raw_arguments: dict[str, object]) -> str:
        result = await call(call_url, {"name": name, "args": raw_arguments})
        if isinstance(result, dict) and result.get("ok") is True:
            return json.dumps(result.get("data"), ensure_ascii=False)
        error = (result or {}).get("error", {}) if isinstance(result, dict) else {}
        code = error.get("code", "TOOL_ERROR")
        message = error.get("message", "tool call failed")
        logger.warning("core tool '%s' failed: %s %s", name, code, message)
        return f"Tool error ({code}): {message}"

    tool = function_tool(
        handler,
        raw_schema={
            "name": name,
            "description": definition.get("description", ""),
            "parameters": definition.get("parameters", {"type": "object", "properties": {}}),
        },
    )
    # Exposed for unit tests: the undecorated coroutine actually doing the work.
    tool.__wrapped_core_handler__ = handler  # type: ignore[attr-defined]
    return tool


async def load_core_tools(core_url: str, *, fetcher: Fetcher | None = None, caller: Caller | None = None) -> list:
    """Fetch the unified tool list from the core and build LiveKit tools.

    Returns [] when the core is unreachable so callers can fall back to the
    legacy in-process tools (degraded, not broken).
    """
    fetch = fetcher or _http_fetch_tools
    tools_url = f"{core_url.rstrip('/')}/tools"
    try:
        definitions = await fetch(tools_url)
    except Exception as exc:  # noqa: BLE001 — any transport failure degrades gracefully
        logger.warning("core tool plane unavailable at %s (%s); falling back to legacy tools", tools_url, exc)
        return []

    tools = []
    for definition in definitions:
        if not isinstance(definition, dict) or "name" not in definition:
            logger.warning("skipping malformed tool definition: %r", definition)
            continue
        tools.append(build_core_tool(definition, core_url, caller=caller))
    return tools
