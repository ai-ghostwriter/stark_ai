from pathlib import Path

from src.screen_processor import create_screen_processor


def test_screen_processor_returns_screenshot_path_when_vision_unavailable(tmp_path: Path):
    shot = tmp_path / "screen.png"

    def capture(_output_dir: Path) -> tuple[Path, str]:
        shot.write_bytes(b"fake")
        return shot, "image/png"

    tool = create_screen_processor(capture=capture, ollama_chat=lambda *_args, **_kwargs: None)

    result = tool({"angle": "screen", "text": "What do you see?", "output_dir": str(tmp_path)})

    assert result["ok"] is True
    assert result["data"]["screenshot_path"] == str(shot)
    assert result["data"]["vision"]["available"] is False
