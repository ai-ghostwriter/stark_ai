# Codex Slice 4 Session Note

## What changed

- Unified `decide(input, ctx, cfg)` into the Slice 4 router policy while keeping the existing public function name and call shape.
- Extended `RouteCtx` with optional `online`, `sensitive`, and `personaHints` fields.
- Kept Anthropic tier selection delegated to `pickApiModel`.
- Wired `FakeBrain` normal turns to the real router and emitted real `route.info` events.
- Added a startup-only reachability check in the offline hub entrypoint and passed the result into `FakeBrain`; the router remains pure.
- Rendered `route.info` inline in the Offline Debug transcript.
- Added table-driven Vitest coverage for routing precedence and FakeBrain persona routing.

## Implemented precedence

| Order | Condition | Target | Reason shape |
| --- | --- | --- | --- |
| 1 | `ctx.override === "local"` | local | `override: local` |
| 1 | `ctx.override === "api"` | api | `override: api (...)` |
| 2 | `ctx.online === false` | local | `offline` |
| 3 | `ctx.sensitive === true` | local | `privacy: sensitive data stays local` |
| 4 | `ctx.heavy`, long input, or configured heavy pattern | api | existing heavy reason plus `pickApiModel` reason |
| 5 | `personaHints.escalateOn` match | api | `persona escalation: <label> (...)` |
| 5 | `personaHints.preferred === "cloud"` | api | `persona prefers cloud (...)` |
| 5 | `personaHints.preferred === "local"` | local | `persona prefers local` |
| 6 | no match | local | `default local` |

Hard rules are above persona hints, so persona preferences never override offline or sensitive routing.

## EscalateOn label mapping

The exported `ROUTING_ESCALATION_MAP` currently supports:

| Label | Task types | Text patterns |
| --- | --- | --- |
| `critical_review` | `critical` | `review`, `critique`, `audit`, `risk`, `rischi`, `critica`, `valuta` |
| `deep_analysis` | `analyze` | `deep analysis`, `analisi approfondita`, `technical analysis`, `architecture`, `architettura`, `debug` |
| `creative` | `creative`, `write`, `copy` | `draft`, `write`, `story`, `outline`, `scrivi`, `bozza`, `racconto` |
| `planning` | `strategy` | `plan`, `roadmap`, `strategy`, `piano`, `strategia` |

Unknown labels are still deterministic: they match a direct `ctx.taskType` equality or a case-insensitive substring in the input.

## Validation

- `cd packages/core && npm test`: 29 files passed, 133 tests passed.
- `cd packages/contracts && npm test`: 2 files passed, 27 tests passed.
- `cd packages/voice && ./.venv/bin/pytest tests`: 51 tests passed.
- `cd packages/ui && npm run build`: passed; Vite emitted the existing large chunk warning.

## Smoke evidence

- Hub startup: `STARK-AI offline event hub listening on ws://127.0.0.1:7710 (online=true)`.
- `fake_voice.py` input `passa a friday` produced `FRIDAY attiva.`
- HUD observed normal FRIDAY `status` route: `{"provider":"api","model":"claude-sonnet-4-6","reason":"persona prefers cloud (default sonnet)"}`.
- HUD observed FRIDAY critical phrase route: `{"provider":"api","model":"claude-sonnet-4-6","reason":"persona escalation: critical_review (default sonnet)"}`.
- `fake_voice.py` input `passa a jarvis` then `status` produced HUD route: `{"provider":"local","model":"qwen3:8b","reason":"persona prefers local"}`.
- `fake_voice.py` input `!barge` produced `[cancel] TTS cancelled` and HUD `tts.cancel`.

## Open points

- `sensitive` is currently passed as `false` by `FakeBrain`; real sensitive-data classification remains future scope.
- Reachability uses a cheap `HEAD https://api.anthropic.com` at hub startup. If the provider endpoint changes behavior, this may need a configurable URL.
- `FakeBrain` still echoes and does not perform real local/API LLM calls; provider execution is later scope.
- Persona switch turns still emit a `route.info` with provider `persona` for observability, but they do not call the router.
