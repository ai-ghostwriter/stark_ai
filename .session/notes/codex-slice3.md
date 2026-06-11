# Codex Slice 3 Session Note

## What changed

- Added decomposed persona profiles in `packages/core/personas/profiles/jarvis.json` and `friday.json`.
- Added core persona registry/state modules in `packages/core/src/personas/`.
- Integrated the active persona into `FakeBrain` so every `tts.speak` carries the active persona id.
- Added FSM-level persona switch intent handling for `passa a <name>` and `switch to <name>`.
- Refactored `packages/voice/personas/jarvis.py` and `friday.py` into thin JSON loaders while preserving their module-level constants.
- Extended offline voice `PERSONA_VOICES` entries with `edgetts` ids for forward compatibility.
- Added focused Vitest and pytest coverage for profile validation, active switching, switch turns, loader equality, and CWD-independent path resolution.

## Verbatim extraction

- Before refactoring the Python persona files, the current module constants were captured from real imports into `.session/tmp/slice3/`.
- The JSON profiles were generated programmatically from those captured files with `json.dumps`; the instruction strings were not retyped.
- Post-refactor equality check:
  - `jarvis.agent: True (1038 bytes)`
  - `jarvis.session: True (262 bytes)`
  - `friday.agent: True (988 bytes)`
  - `friday.session: True (246 bytes)`

## Decisions

- `packages/core/src/personas/registry.ts` validates profile JSONs with `PersonaProfile.parse` during module load and throws `Invalid persona profile <file>:` for corrupted data.
- `packages/core/src/personas/active.ts` owns only runtime active-persona state, defaulting to `jarvis`; unknown ids leave state unchanged through registry validation.
- Persona switching is handled in `FakeBrain` as an FSM intent, not a tool call.
- Unknown switch-like phrases such as `passa a veronica` are normal echo turns until a corresponding profile exists.
- Voice ids are read from persona profile data or voice-core maps; no voice resolution logic was added to core runtime.
- `packages/contracts/**` and `packages/voice/contracts_gen/**` were not modified.

## Deviation from INTEGRATION §6 step 6

- The original migration plan suggested moving the Python persona files to `legacy/`.
- STARK-AI keeps `packages/voice/personas/jarvis.py` and `friday.py` in place as thin loaders because the online LiveKit path imports these modules at runtime through `agent.py` and `personas/__init__.py`.
- Moving them now would break the online bridge; the decomposition is achieved by removing embedded identity text from the Python files while preserving the API.

## Validation

- `cd packages/core && npm test`: 29 files passed, 121 tests passed.
- `cd packages/voice && ./.venv/bin/pytest tests/ -v`: 51 tests passed.
- `cd packages/contracts && npm test`: 2 files passed, 27 tests passed.
- `cd packages/ui && npm run build`: passed; Vite emitted the existing large chunk warning.
- Smoke with `make dev-offline`:
  - Input: `passa a friday`
  - Observed: `🔊 [friday/-] FRIDAY attiva.`
  - Input: `status`
  - Observed: `🔊 [friday/-] Ho ricevuto: "status"`

## Open points

- `veronica` and `warmachine` profiles are deferred until their instruction assets are consolidated.
- Router consumption of `routingHints` remains Slice 4 work.
- LiveKit online path keeps importing the same persona modules; a live online session smoke is still a separate manual check.
