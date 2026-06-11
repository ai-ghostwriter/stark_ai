# Codex Slice 5a - MCP tool infrastructure and OS/FILES servers

Date: 2026-06-11

## Scope delivered

- Added root `tools/` MCP server layout:
  - `tools/mcp-os`: `open_app`, `computer_control`, `computer_settings`, `desktop`
  - `tools/mcp-files`: `file_controller`, `file_processor`
- Added `tools/mcp.config.json` so core discovers MCP servers from config instead of hardcoded core edits.
- Added `packages/core/src/tools/mcp/` client layer and merged MCP handles into the existing in-process tool registry.
- Added a minimal `FakeBrain` demonstration intent: `apri <app>` / `open <app>` dispatches `open_app`, emits `tool.call` and `tool.result`, then emits `tts.speak`.

## Donor action mapping

| Donor action | New tool | Kept | Dropped and why |
|---|---|---|---|
| `open_app.py` | `mcp-os/open_app` | Alias normalization, OS dispatch shape, macOS `open -a` then `.app` fallback, structured launch uncertainty. | PyAutoGUI/Spotlight fallback and print-driven flow; extra permissions and nondeterministic UI automation are deferred. |
| `computer_control.py` | `mcp-os/computer_control` | Safe local controls via OS dispatch and bounded arguments. | Mouse/keyboard/form automation, random/user data, screen AI finder; broad UI automation belongs in a later browser/screen phase. |
| `computer_settings.py` | `mcp-os/computer_control` and `mcp-os/computer_settings` | Volume/display/lock subset, memory/disk/battery/system information. | `restart`/`shutdown` are excluded by design; Wi-Fi/dark-mode/window hotkeys are deferred because they mutate broader system state. |
| `desktop.py` | `mcp-os/desktop` | Screenshot-to-file and best-effort macOS window listing with graceful degradation. | Wallpaper changes, desktop cleanup/organize, generated code execution; these are either mutating or monolithic/LLM-driven patterns. |
| `file_controller.py` | `mcp-files/file_controller` | List/move/copy/rename/delete behavior and metadata-oriented responses. | Home-wide access and create/write helpers; this slice constrains operations to configured allowlist roots and focuses on requested actions. |
| `file_processor.py` | `mcp-files/file_processor` | Type detection and text extraction for txt/md/json/csv, metadata reporting, PDF placeholder. | AI summarization, image/audio/video/archive transforms, subprocess execution and heavyweight deps; these move to phase 2 dedicated servers. |

## Security constraints added

- File tools are restricted to `STARK_AI_MCP_FILE_ROOTS` or default `~/Desktop`, `~/Documents`, `~/Downloads`.
- Path traversal outside allowlisted roots returns `PATH_OUTSIDE_ALLOWED_ROOTS`.
- OS control excludes destructive power operations (`shutdown`, `restart`) entirely.
- MCP failures return structured `{ ok: false, error: { code, message, details } }` results instead of throwing through the core.
- Core dispatch applies per-tool timeout, one transport-error respawn attempt, and keeps the agent process alive on tool server crash.

## Phase 2 open points

- Port remaining Mark-XL actions: browser/screen/web/message/reminder/dev/code/weather/youtube/flight/game groups.
- Add true PDF extraction with a light dependency if acceptable.
- Add richer macOS app focus/window listing if accessibility permissions are explicitly configured.
- Split broad automation into dedicated browser/screen MCP servers rather than expanding `computer_control`.
