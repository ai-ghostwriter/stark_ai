from __future__ import annotations

import asyncio
import json
import sys
from typing import Any

from screen_processor import create_screen_processor


screen_processor = create_screen_processor()


def tool_schema() -> dict[str, Any]:
    return {
        "type": "object",
        "properties": {
            "angle": {"type": "string", "enum": ["screen"]},
            "text": {"type": "string"},
            "output_dir": {"type": "string"},
        },
    }


async def run_fastmcp() -> None:
    from mcp.server.fastmcp import FastMCP

    mcp = FastMCP("stark-ai-mcp-screen")

    @mcp.tool(name="screen_processor", description="Capture a screenshot and optionally analyze it with an Ollama vision model.")
    def screen_processor_tool(angle: str = "screen", text: str = "", output_dir: str = "") -> dict[str, Any]:
        return screen_processor({"angle": angle, "text": text, "output_dir": output_dir})

    await mcp.run_stdio_async()


def write_response(message: dict[str, Any]) -> None:
    sys.stdout.write(json.dumps(message) + "\n")
    sys.stdout.flush()


async def run_minimal_stdio() -> None:
    """Fallback used only when the pinned python mcp package is not installed."""
    for line in sys.stdin:
      try:
          req = json.loads(line)
      except json.JSONDecodeError:
          continue
      method = req.get("method")
      req_id = req.get("id")
      if method == "initialize":
          write_response({"jsonrpc": "2.0", "id": req_id, "result": {"protocolVersion": "2024-11-05", "capabilities": {"tools": {}}, "serverInfo": {"name": "stark-ai-mcp-screen", "version": "0.1.0"}}})
      elif method == "tools/list":
          write_response({"jsonrpc": "2.0", "id": req_id, "result": {"tools": [{"name": "screen_processor", "description": "Capture a screenshot and optionally analyze it with Ollama vision.", "inputSchema": tool_schema()}]}})
      elif method == "tools/call":
          params = req.get("params") or {}
          result = screen_processor(params.get("arguments") or {})
          write_response({"jsonrpc": "2.0", "id": req_id, "result": {"isError": not result.get("ok"), "content": [{"type": "text", "text": json.dumps(result)}]}})
      elif method == "notifications/initialized":
          continue
      else:
          write_response({"jsonrpc": "2.0", "id": req_id, "error": {"code": -32601, "message": f"Unknown method: {method}"}})


async def main() -> None:
    try:
        import mcp  # noqa: F401
    except Exception:
        await run_minimal_stdio()
        return
    await run_fastmcp()


if __name__ == "__main__":
    asyncio.run(main())
