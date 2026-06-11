# Codex Slice 5b - Remaining Mark-XL actions as MCP servers

Date: 2026-06-11

## Scope delivered

- Added `tools/mcp-web` (TypeScript): `browser_control`, `web_search`, `youtube_video`, `flight_finder`.
- Added `tools/mcp-screen` (Python): `screen_processor`.
- Added `tools/mcp-productivity` (TypeScript): `reminder`, `weather_report`, `send_message`.
- Added `tools/mcp-dev` (TypeScript): `code_helper`, `dev_agent`, `game_updater`.
- Registered all new servers in `tools/mcp.config.json`; core discovery remains config-driven.
- Added a core MCP startup summary log for smoke evidence: per-server counts and total tools.
- Added two minimal FakeBrain voice intents:
  - `che tempo fa ...` / `weather ...` -> `weather_report`
  - `cerca ...` / `search ...` -> `web_search`

## Grouping rationale

- `mcp-web`: browser/search/video/flight all resolve to URLs, fetches, and light HTML parsing. No Playwright/puppeteer was added because the ported subset does not require DOM session interaction.
- `mcp-screen`: kept separate because screenshot capture and optional vision analysis have different runtime/dependency and permission behavior from TS servers.
- `mcp-productivity`: reminders, weather, and message drafting are user-productivity helpers with OS/app side effects.
- `mcp-dev`: code/dev/game helpers are deterministic local development utilities after removing donor LLM calls and risky launcher automation.

## Donor mapping

| Donor action | New MCP tool | Kept | Adapted | Dropped and why |
|---|---|---|---|---|
| `browser_control.py` | `mcp-web/browser_control` | URL normalization, system browser open, search URL builders. | `go_to` and `search` open URLs through OS browser only. | Playwright persistent sessions, click/type/scroll/press/get_text/get_url. These require DOM/session automation and a heavy browser dependency not justified for this slice. |
| `web_search.py` | `mcp-web/web_search` | DuckDuckGo HTML search, compare mode shape, result title/snippet/url output. | LLM summary replaced by deterministic top-result summary. | Ollama/LLM summarization belongs to the brain, not the tool. |
| `youtube_video.py` | `mcp-web/youtube_video` | Search page URL, first non-Shorts video scrape, open video/search, basic video info/trending regex scraping. | `summarize` returns a structured unsupported error and optional note path behavior was reduced. | Transcript summarization and dialog prompting require extra deps and LLM reasoning; GUI automation and pyautogui were removed. |
| `flight_finder.py` | `mcp-web/flight_finder` | Route/date/passenger/cabin inputs and Google Flights target. | Implemented best-effort Google Flights deep-link builder with simple deterministic date parsing. | Browser scraping and Gemini extraction are fragile and violate the no-tool-LLM rule. |
| `screen_processor.py` | `mcp-screen/screen_processor` | Screenshot capture, Ollama vision attempt, structured prompt. | If Ollama vision is unavailable, returns screenshot path and `vision.available=false`; never crashes. Camera is explicitly unsupported for this slice. | Camera/OpenCV probing and config mutation were omitted to keep permissions and dependencies narrow. |
| `send_message.py` | `mcp-productivity/send_message` | Platform normalization and opening the target app/link. | Safe subset only: drafts/opens target, returns recipient/message metadata. | Auto-recipient search, paste, and send were dropped. Even `confirm=true` returns `AUTO_SEND_UNSUPPORTED`; final send must be user-controlled. |
| `weather_report.py` | `mcp-productivity/weather_report` | City/time input and spoken-friendly summary. | Uses Open-Meteo directly instead of Google search page. MCP tool name is `weather_report` and wins over overlapping in-process weather behavior by registry collision policy when names collide. | Browser-only weather search was replaced with structured API data. |
| `reminder.py` | `mcp-productivity/reminder` | Date/time validation, past-time guard, sanitized message. | macOS Reminders via `osascript` when available; otherwise append local JSONL reminder store. | Windows schtasks/Linux systemd/at script generation omitted for now; local JSONL fallback is predictable and testable. |
| `code_helper.py` | `mcp-dev/code_helper` | Deterministic file execution with captured stdout/stderr and timeout. | Only `run` is supported. | `write`, `edit`, `explain`, `build`, `optimize`, `screen_debug` LLM/code-fix behavior belongs to the brain, not the tool. |
| `dev_agent.py` | `mcp-dev/dev_agent` | Project directory creation and command execution concept. | Deterministic templates (`node-cli`, `python-cli`) plus `run_command`. | LLM planning/writing/fixing, auto pip installs, and VS Code launch were dropped. |
| `game_updater.py` | `mcp-dev/game_updater` | Known Steam AppID resolution and local Steam manifest parsing/status. | Supports `resolve`, `list`, and `download_status` deterministically. | Launcher mutation (`install`, `update`), GUI drive selection, auto-shutdown, and scheduling were dropped as risky side effects. |

## Dependency decisions

- Browser: no Playwright/puppeteer dependency. Current behavior is `open` + `fetch` + light HTML parsing. DOM interaction can be isolated later in `mcp-web` if Slice 6 explicitly needs it.
- Web/search: no DDG package dependency; DuckDuckGo HTML is parsed with small regex helpers.
- Screen: `requirements.txt` pins `mcp`, `requests`, `mss`, `Pillow`, and `pytest`. Because this environment did not have the Python MCP package installed and runtime installs are disallowed, `src/server.py` includes a minimal stdio fallback so the hub can still list/call `screen_processor`; a prepared venv should use the official package path.
- Productivity: no pyautogui/pyperclip. Message sending is intentionally draft-only.
- Dev: no LLM SDKs and no package-manager auto-installs.

## Security constraints

- `send_message` never sends to recipients automatically. The `confirm` flag is reserved and currently rejected with `AUTO_SEND_UNSUPPORTED`.
- `flight_finder` does not scrape logged-in browser pages.
- `browser_control` does not click, type, or extract active page state.
- `code_helper` and `dev_agent` run only explicit user-provided files/commands or deterministic templates; no model-generated code.
- `game_updater` does not trigger launcher updates/installs or shutdown.
- `screen_processor` writes screenshots only to the requested/default output dir and returns structured unavailable results for capture/vision failures.

## Slice 6 open points

- Decide whether a browser automation server with Playwright is worth the dependency and permission cost.
- Prepare the `tools/mcp-screen` venv from pinned requirements in setup scripts, then remove or keep the fallback based on deployment policy.
- Add richer reminder listing/cancel operations for the local JSONL backend.
- Add command allowlists or workspace-root constraints for `mcp-dev` before exposing it to untrusted prompts.
- Decide whether `get_weather` should be renamed or deprecated so the MCP `weather_report` collision policy can be demonstrated with identical names if desired.
