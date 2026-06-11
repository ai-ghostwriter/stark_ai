from __future__ import annotations

import base64
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, Callable
from urllib import request, error


ToolResult = dict[str, Any]
CaptureFn = Callable[[Path], tuple[Path, str]]
OllamaFn = Callable[[Path, str, str], str | None]


def success(data: dict[str, Any]) -> ToolResult:
    return {"ok": True, "data": data}


def failure(code: str, message: str, details: Any = None) -> ToolResult:
    result: ToolResult = {"ok": False, "error": {"code": code, "message": message}}
    if details is not None:
        result["error"]["details"] = details
    return result


def default_output_dir() -> Path:
    return Path(os.environ.get("STARK_AI_SCREEN_DIR", str(Path.home() / ".stark-ai" / "screenshots")))


def capture_screen(output_dir: Path) -> tuple[Path, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / f"screen_{int(time.time())}.png"

    if os.environ.get("STARK_AI_SCREEN_TEST_PLACEHOLDER") == "1":
        path.write_bytes(b"placeholder")
        return path, "image/png"

    if os.uname().sysname == "Darwin":
        subprocess.run(["screencapture", "-x", str(path)], check=True, timeout=10)
        return path, "image/png"

    try:
        import mss
        import mss.tools

        with mss.mss() as sct:
            monitor = sct.monitors[1] if len(sct.monitors) > 1 else sct.monitors[0]
            shot = sct.grab(monitor)
            mss.tools.to_png(shot.rgb, shot.size, output=str(path))
        return path, "image/png"
    except Exception as exc:
        raise RuntimeError(f"screen capture unavailable: {exc}") from exc


def ollama_chat(image_path: Path, mime: str, prompt: str) -> str | None:
    base_url = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    model = os.environ.get("OLLAMA_VISION_MODEL", os.environ.get("OLLAMA_MODEL", "llava"))
    try:
        image_b64 = base64.b64encode(image_path.read_bytes()).decode("ascii")
        payload = json.dumps(
            {
                "model": model,
                "stream": False,
                "messages": [
                    {
                        "role": "user",
                        "content": prompt or "What do you see? Describe briefly.",
                        "images": [image_b64],
                    }
                ],
            }
        ).encode("utf-8")
        req = request.Request(
            f"{base_url}/api/chat",
            data=payload,
            headers={"content-type": "application/json"},
            method="POST",
        )
        with request.urlopen(req, timeout=20) as response:
            data = json.loads(response.read().decode("utf-8"))
        text = (data.get("message", {}) or {}).get("content", "")
        return text.strip() or None
    except (OSError, error.URLError, TimeoutError, json.JSONDecodeError):
        return None


def create_screen_processor(
    capture: CaptureFn = capture_screen,
    ollama_chat: OllamaFn = ollama_chat,
) -> Callable[[dict[str, Any]], ToolResult]:
    def screen_processor(args: dict[str, Any]) -> ToolResult:
        output_dir = Path(str(args.get("output_dir") or default_output_dir())).expanduser()
        prompt = str(args.get("text") or args.get("user_text") or "What do you see? Describe briefly.")
        angle = str(args.get("angle") or "screen").lower().strip()

        if angle != "screen":
            return failure("CAMERA_UNSUPPORTED", "Only screen capture is ported in this MCP server.")

        try:
            screenshot_path, mime = capture(output_dir)
        except Exception as exc:
            return failure("CAPTURE_FAILED", "Screenshot capture failed.", str(exc))

        analysis = ollama_chat(screenshot_path, mime, prompt)
        vision = (
            {"available": True, "model": os.environ.get("OLLAMA_VISION_MODEL", os.environ.get("OLLAMA_MODEL", "llava")), "analysis": analysis}
            if analysis
            else {"available": False, "reason": "No reachable Ollama vision model or no response."}
        )
        return success({"screenshot_path": str(screenshot_path), "mime": mime, "prompt": prompt, "vision": vision})

    return screen_processor
