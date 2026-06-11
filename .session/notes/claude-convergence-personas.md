# Convergence fix + VERONICA/WAR-MACHINE — Claude (no Codex, quota exhausted)

## Part 1 — Uniform tool plane (user-reported bug)
- `GET /tools` + `POST /tools/call` on the core HTTP server (server.ts): registry as the single tool authority. ToolResult passthrough for MCP handles, ok/data wrap for in-process results.
- `packages/voice/core_tools.py`: dynamic LiveKit raw function tools built from /tools; gemini+gpt sessions now load 26 tools (17 MCP + in-process incl. KDP); legacy trio only as degraded fallback.
- `start.sh` boots the WS hub (STARK_BRAIN=real) — converged brain on by default.

## Part 2 — Personas
- Contract: PersonaId += "warmachine" (additive, no v bump), fixture added, codegen, both-side tests green.
- Profiles veronica.json / warmachine.json — instruction texts are FIRST DRAFTS by Claude (no pre-existing user asset to migrate verbatim); user may refine.
- Voices: veronica=af_bella/en-GB-SoniaNeural, warmachine=am_michael/en-US-ChristopherNeural.
- Shared `personas/switchIntent.ts` (multi-word names) replaces duplicated brain methods; gender fix in confirmation text.
- Voice side: PERSONA_VOICES, thin loaders, wake words (VERONICA / WARMACHINE / WAR MACHINE).

## Verification
All suites green: core 163, voice 62, contracts 28 TS + 25 py, tools 6 suites, ui build.
Smokes: /tools=26, /tools/call ok on MCP tool, dynamic builder=26 LiveKit tools, switch by voice to both new personas.

## Open
- Gemini realtime may be strict about some JSON Schema params of dynamic tools — verify live in browser.
- Persona instruction drafts to be refined by Ricky.
