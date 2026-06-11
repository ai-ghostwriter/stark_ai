# Slice 0 — Contracts Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create `packages/contracts` — the typed event contract (Zod source of truth) with golden fixtures, JSON Schema export, generated Pydantic models in `packages/voice`, and contract tests on both sides, locked by CI.

**Architecture:** Zod schemas in TS are the single source of truth (per `docs/mark-r/SLICE-0-SPEC.md` §3 and `docs/mark-r/INTEGRATION-JARVIS-FRIDAY.md` §3). A script exports JSON Schema; `datamodel-code-generator` generates Pydantic v2 models committed into `packages/voice/contracts_gen/`. Golden fixtures (valid + invalid) are validated by Vitest AND pytest — the anti-drift lock. No runtime behavior changes in this slice (per `docs/mark-r/ADAPTATION-STARK-AI.md`).

**Tech Stack:** zod ^3, zod-to-json-schema, tsx, Vitest (TS side); datamodel-code-generator (pinned), pydantic v2, pytest (Python side); GitHub Actions for the sync check.

**Conventions (from existing repo):** standalone npm package (no root workspace), `"type": "module"`, strict tsconfig copied from `packages/core`. Python deps via `packages/voice/requirements.txt`, venv at `packages/voice/.venv` (Python 3.13). Code/comments/commits in English.

---

### Task 1: Scaffold `packages/contracts`

**Files:**
- Create: `packages/contracts/package.json`
- Create: `packages/contracts/tsconfig.json`
- Create: `packages/contracts/.gitignore`

- [ ] **Step 1: Create `packages/contracts/package.json`**

```json
{
  "name": "@stark-ai/contracts",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "gen": "tsx scripts/gen-jsonschema.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0",
    "zod-to-json-schema": "^3.23.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `packages/contracts/tsconfig.json`** (same options as `packages/core`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist"
  },
  "include": ["src", "test", "scripts"]
}
```

- [ ] **Step 3: Create `packages/contracts/.gitignore`**

```
node_modules/
dist/
```

Note: `dist-schema/` is NOT ignored — the exported JSON Schema is committed so CI can diff-check it.

- [ ] **Step 4: Install dependencies**

Run: `cd packages/contracts && npm install`
Expected: `package-lock.json` created, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/contracts
git commit -m "chore(contracts): scaffold @stark-ai/contracts package"
```

---

### Task 2: Event schemas + golden fixtures (TDD)

**Files:**
- Create: `packages/contracts/fixtures/events/valid/*.json` (13 files)
- Create: `packages/contracts/fixtures/events/invalid/*.json` (6 files)
- Create: `packages/contracts/test/helpers.ts`
- Test: `packages/contracts/test/events.test.ts`
- Create: `packages/contracts/src/events.ts`

- [ ] **Step 1: Create valid fixtures** in `packages/contracts/fixtures/events/valid/`

`hello.json`:
```json
{ "v": 1, "type": "hello", "role": "voice", "client": "voice-core@0.1" }
```
`stt.partial.json`:
```json
{ "v": 1, "type": "stt.partial", "text": "accendi le" }
```
`stt.final.json`:
```json
{ "v": 1, "type": "stt.final", "text": "accendi le luci dello studio", "lang": "it" }
```
`stt.final-default-lang.json` (exercises the `lang` default):
```json
{ "v": 1, "type": "stt.final", "text": "turn on the lights" }
```
`barge_in.json`:
```json
{ "v": 1, "type": "barge_in" }
```
`tts.speak.json`:
```json
{ "v": 1, "type": "tts.speak", "text": "Right away, sir.", "voice": "am_adam", "persona": "jarvis" }
```
`tts.cancel.json`:
```json
{ "v": 1, "type": "tts.cancel" }
```
`agent.token.json`:
```json
{ "v": 1, "type": "agent.token", "delta": "Sub" }
```
`agent.done.json`:
```json
{ "v": 1, "type": "agent.done" }
```
`route.info.json`:
```json
{ "v": 1, "type": "route.info", "provider": "ollama", "model": "qwen2.5:7b", "reason": "offline" }
```
`tool.call.json`:
```json
{ "v": 1, "type": "tool.call", "id": "t1", "name": "get_weather", "args": { "city": "Milano" } }
```
`tool.result.json`:
```json
{ "v": 1, "type": "tool.result", "id": "t1", "ok": true, "data": { "temp": 21 } }
```
`sys.error.json`:
```json
{ "v": 1, "type": "sys.error", "scope": "hub", "message": "malformed frame dropped" }
```

- [ ] **Step 2: Create invalid fixtures** in `packages/contracts/fixtures/events/invalid/`

`unknown-type.json`:
```json
{ "v": 1, "type": "warp.drive" }
```
`wrong-version.json`:
```json
{ "v": 2, "type": "barge_in" }
```
`stt.final-missing-text.json`:
```json
{ "v": 1, "type": "stt.final", "lang": "it" }
```
`tts.speak-bad-persona.json`:
```json
{ "v": 1, "type": "tts.speak", "text": "hi", "persona": "ultron" }
```
`tool.call-args-not-object.json`:
```json
{ "v": 1, "type": "tool.call", "id": "t1", "name": "x", "args": "nope" }
```
`agent.token-delta-number.json`:
```json
{ "v": 1, "type": "agent.token", "delta": 42 }
```

Note: do NOT add an "extra field" fixture — both Zod (non-strict) and Pydantic (default) ignore unknown keys, so it would not fail on either side.

- [ ] **Step 3: Create `packages/contracts/test/helpers.ts`**

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface Fixture {
  name: string;
  raw: string;
}

export const loadFixtures = (group: string, sub: "valid" | "invalid"): Fixture[] => {
  const dir = join(process.cwd(), "fixtures", group, sub);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({ name: f, raw: readFileSync(join(dir, f), "utf8") }));
};
```

- [ ] **Step 4: Write the failing test** `packages/contracts/test/events.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { Event, parseEvent } from "../src/events.js";
import { loadFixtures } from "./helpers.js";

const valid = loadFixtures("events", "valid");
const invalid = loadFixtures("events", "invalid");

describe("event contract — golden fixtures", () => {
  it("covers every event type with at least one valid fixture", () => {
    const types = new Set(valid.map(({ raw }) => JSON.parse(raw).type as string));
    expect([...types].sort()).toEqual([
      "agent.done", "agent.token", "barge_in", "hello",
      "route.info", "stt.final", "stt.partial", "sys.error",
      "tool.call", "tool.result", "tts.cancel", "tts.speak",
    ]);
  });

  it.each(valid.map((f) => [f.name, f.raw] as const))(
    "valid fixture %s parses",
    (_name, raw) => {
      expect(() => parseEvent(raw)).not.toThrow();
    },
  );

  it.each(invalid.map((f) => [f.name, f.raw] as const))(
    "invalid fixture %s is rejected",
    (_name, raw) => {
      expect(() => parseEvent(raw)).toThrow();
    },
  );

  it("applies defaults: stt.final lang, tts.speak persona", () => {
    expect(Event.parse({ v: 1, type: "stt.final", text: "ciao" })).toMatchObject({ lang: "auto" });
    expect(Event.parse({ v: 1, type: "tts.speak", text: "hello" })).toMatchObject({ persona: "default" });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd packages/contracts && npm test`
Expected: FAIL — cannot resolve `../src/events.js`.

- [ ] **Step 6: Write `packages/contracts/src/events.ts`** (normative code from SLICE-0-SPEC §3, verbatim)

```ts
import { z } from "zod";

export const Lang = z.enum(["auto", "it", "en", "de", "fr"]);
export const PersonaId = z.enum(["jarvis", "friday", "veronica", "default"]);

const base = { v: z.literal(1) };

// — handshake —
export const Hello = z.object({ ...base, type: z.literal("hello"),
  role: z.enum(["voice", "hud"]), client: z.string() });

// — voice-core → agent-core —
export const SttPartial = z.object({ ...base, type: z.literal("stt.partial"), text: z.string() });
export const SttFinal   = z.object({ ...base, type: z.literal("stt.final"),
  text: z.string(), lang: Lang.default("auto") });
export const BargeIn    = z.object({ ...base, type: z.literal("barge_in") });

// — agent-core → voice-core —
export const TtsSpeak  = z.object({ ...base, type: z.literal("tts.speak"),
  text: z.string(), voice: z.string().optional(), persona: PersonaId.default("default") });
export const TtsCancel = z.object({ ...base, type: z.literal("tts.cancel") });

// — agent-core → hud (and log) —
export const AgentToken = z.object({ ...base, type: z.literal("agent.token"), delta: z.string() });
export const AgentDone  = z.object({ ...base, type: z.literal("agent.done") });
export const RouteInfo  = z.object({ ...base, type: z.literal("route.info"),
  provider: z.string(), model: z.string(), reason: z.string() });
export const ToolCall   = z.object({ ...base, type: z.literal("tool.call"),
  id: z.string(), name: z.string(), args: z.record(z.unknown()) });
export const ToolResult = z.object({ ...base, type: z.literal("tool.result"),
  id: z.string(), ok: z.boolean(), data: z.unknown() });
export const SysError   = z.object({ ...base, type: z.literal("sys.error"),
  scope: z.string(), message: z.string() });

export const Event = z.discriminatedUnion("type", [
  Hello, SttPartial, SttFinal, BargeIn,
  TtsSpeak, TtsCancel,
  AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
]);
export type Event = z.infer<typeof Event>;

export const parseEvent = (raw: string): Event => Event.parse(JSON.parse(raw));
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd packages/contracts && npm test`
Expected: PASS — all fixture tests green (13 valid + 6 invalid + 2 meta tests).

- [ ] **Step 8: Commit**

```bash
git add packages/contracts/src packages/contracts/test packages/contracts/fixtures
git commit -m "feat(contracts): event schemas with golden fixtures and contract tests"
```

---

### Task 3: PersonaProfile schema + fixtures (TDD)

**Files:**
- Create: `packages/contracts/fixtures/persona/valid/*.json` (2 files)
- Create: `packages/contracts/fixtures/persona/invalid/*.json` (3 files)
- Test: `packages/contracts/test/persona.test.ts`
- Create: `packages/contracts/src/persona.ts`
- Create: `packages/contracts/src/index.ts`

- [ ] **Step 1: Create valid fixtures** in `packages/contracts/fixtures/persona/valid/`

`jarvis.json`:
```json
{
  "id": "jarvis",
  "displayName": "JARVIS",
  "voice": { "kokoro": "am_adam", "edgetts": "en-US-GuyNeural" },
  "agentInstruction": "Schema placeholder. The real AGENT_INSTRUCTION block migrates verbatim from packages/voice/personas/jarvis.py in Slice 3.",
  "sessionInstruction": "Schema placeholder. The real SESSION_INSTRUCTION block migrates verbatim in Slice 3.",
  "routingHints": { "preferred": "local", "escalateOn": ["deep_analysis"] },
  "language": "auto"
}
```
`friday.json`:
```json
{
  "id": "friday",
  "displayName": "FRIDAY",
  "voice": { "kokoro": "af_sky", "edgetts": "en-IE-EmilyNeural" },
  "agentInstruction": "Schema placeholder. The real AGENT_INSTRUCTION block migrates verbatim from packages/voice/personas/friday.py in Slice 3.",
  "sessionInstruction": "Schema placeholder. The real SESSION_INSTRUCTION block migrates verbatim in Slice 3.",
  "routingHints": { "preferred": "cloud", "escalateOn": ["critical_review"] },
  "language": "auto"
}
```

- [ ] **Step 2: Create invalid fixtures** in `packages/contracts/fixtures/persona/invalid/`

`bad-id.json`:
```json
{
  "id": "ultron",
  "displayName": "ULTRON",
  "voice": { "kokoro": "am_adam" },
  "agentInstruction": "x",
  "sessionInstruction": "y",
  "routingHints": { "preferred": "local", "escalateOn": [] }
}
```
`missing-agent-instruction.json`:
```json
{
  "id": "jarvis",
  "displayName": "JARVIS",
  "voice": { "kokoro": "am_adam" },
  "sessionInstruction": "y",
  "routingHints": { "preferred": "local", "escalateOn": [] }
}
```
`bad-routing-preferred.json`:
```json
{
  "id": "friday",
  "displayName": "FRIDAY",
  "voice": { "kokoro": "af_sky" },
  "agentInstruction": "x",
  "sessionInstruction": "y",
  "routingHints": { "preferred": "mars", "escalateOn": [] }
}
```

- [ ] **Step 3: Write the failing test** `packages/contracts/test/persona.test.ts`

```ts
import { describe, expect, it } from "vitest";
import { PersonaProfile } from "../src/persona.js";
import { loadFixtures } from "./helpers.js";

const valid = loadFixtures("persona", "valid");
const invalid = loadFixtures("persona", "invalid");

describe("PersonaProfile contract — golden fixtures", () => {
  it.each(valid.map((f) => [f.name, f.raw] as const))(
    "valid fixture %s parses",
    (_name, raw) => {
      expect(() => PersonaProfile.parse(JSON.parse(raw))).not.toThrow();
    },
  );

  it.each(invalid.map((f) => [f.name, f.raw] as const))(
    "invalid fixture %s is rejected",
    (_name, raw) => {
      expect(() => PersonaProfile.parse(JSON.parse(raw))).toThrow();
    },
  );

  it("applies the language default", () => {
    const { language, ...rest } = JSON.parse(valid[0]!.raw);
    expect(PersonaProfile.parse(rest)).toMatchObject({ language: "auto" });
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd packages/contracts && npm test`
Expected: `persona.test.ts` FAILS — cannot resolve `../src/persona.js`. (`events.test.ts` stays green.)

- [ ] **Step 5: Write `packages/contracts/src/persona.ts`** (from INTEGRATION-JARVIS-FRIDAY §3)

```ts
import { z } from "zod";
import { Lang, PersonaId } from "./events.js";

export const RoutingHints = z.object({
  preferred: z.enum(["local", "cloud"]),
  escalateOn: z.array(z.string()).default([]),
});

export const PersonaProfile = z.object({
  id: PersonaId,
  displayName: z.string(),
  voice: z.record(z.string()), // TTS engine id → voice id (e.g. kokoro → am_adam)
  agentInstruction: z.string(),
  sessionInstruction: z.string(),
  routingHints: RoutingHints,
  language: Lang.default("auto"),
});
export type PersonaProfile = z.infer<typeof PersonaProfile>;
```

- [ ] **Step 6: Write `packages/contracts/src/index.ts`**

```ts
export * from "./events.js";
export * from "./persona.js";
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd packages/contracts && npm test`
Expected: PASS — both test files green.

- [ ] **Step 8: Typecheck**

Run: `cd packages/contracts && npm run typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/contracts/src packages/contracts/test packages/contracts/fixtures
git commit -m "feat(contracts): PersonaProfile schema with golden fixtures"
```

---

### Task 4: JSON Schema export

**Files:**
- Create: `packages/contracts/scripts/gen-jsonschema.ts`
- Generated (committed): `packages/contracts/dist-schema/events.schema.json`, `packages/contracts/dist-schema/persona.schema.json`

- [ ] **Step 1: Write `packages/contracts/scripts/gen-jsonschema.ts`**

```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  AgentDone, AgentToken, BargeIn, Event, Hello, RouteInfo,
  SttFinal, SttPartial, SysError, ToolCall, ToolResult, TtsCancel, TtsSpeak,
} from "../src/events.js";
import { PersonaProfile, RoutingHints } from "../src/persona.js";

mkdirSync("dist-schema", { recursive: true });

// Named definitions give the Python codegen stable, readable class names.
const eventSchema = zodToJsonSchema(Event, {
  name: "Event",
  definitions: {
    Hello, SttPartial, SttFinal, BargeIn, TtsSpeak, TtsCancel,
    AgentToken, AgentDone, RouteInfo, ToolCall, ToolResult, SysError,
  },
});
writeFileSync("dist-schema/events.schema.json", JSON.stringify(eventSchema, null, 2) + "\n");

const personaSchema = zodToJsonSchema(PersonaProfile, {
  name: "PersonaProfile",
  definitions: { RoutingHints },
});
writeFileSync("dist-schema/persona.schema.json", JSON.stringify(personaSchema, null, 2) + "\n");

console.log("dist-schema written: events.schema.json, persona.schema.json");
```

- [ ] **Step 2: Run the generator**

Run: `cd packages/contracts && npm run gen`
Expected: both files created under `dist-schema/`.

- [ ] **Step 3: Sanity-check the output**

Run: `python3 -c "import json; s=json.load(open('packages/contracts/dist-schema/events.schema.json')); print(sorted(s['definitions'].keys()))"`
Expected: list containing `Event`, `Hello`, `SttFinal`, `TtsSpeak`, etc.

- [ ] **Step 4: Commit (dist-schema IS committed — CI diff-checks it)**

```bash
git add packages/contracts/scripts packages/contracts/dist-schema
git commit -m "feat(contracts): JSON Schema export for Python codegen"
```

---

### Task 5: Pydantic codegen into `packages/voice`

**Files:**
- Modify: `packages/voice/requirements.txt` (add pinned codegen tool)
- Create: `packages/voice/contracts_gen/__init__.py`
- Generated (committed): `packages/voice/contracts_gen/events.py`, `packages/voice/contracts_gen/persona.py`

- [ ] **Step 1: Add the codegen tool to `packages/voice/requirements.txt`** (append line)

```
datamodel-code-generator==0.26.5
```

The version is PINNED because CI regenerates and diff-checks: local venv and CI must produce identical output. If 0.26.5 is unavailable, pin whatever recent version installs cleanly and use the SAME pin in `.github/workflows/contracts.yml` (Task 7).

- [ ] **Step 2: Install into the existing venv**

Run: `cd packages/voice && ./.venv/bin/pip install "datamodel-code-generator==0.26.5"`
Expected: installs without breaking existing deps.

- [ ] **Step 3: Generate the models** (run from repo root)

```bash
packages/voice/.venv/bin/datamodel-codegen \
  --input packages/contracts/dist-schema/events.schema.json \
  --input-file-type jsonschema \
  --output packages/voice/contracts_gen/events.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.12 \
  --disable-timestamp \
  --custom-file-header "# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'."

packages/voice/.venv/bin/datamodel-codegen \
  --input packages/contracts/dist-schema/persona.schema.json \
  --input-file-type jsonschema \
  --output packages/voice/contracts_gen/persona.py \
  --output-model-type pydantic_v2.BaseModel \
  --target-python-version 3.12 \
  --disable-timestamp \
  --custom-file-header "# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'."
```

- [ ] **Step 4: Verify the generated root models exist**

Run: `grep -E "^class (Event|PersonaProfile)" packages/voice/contracts_gen/events.py packages/voice/contracts_gen/persona.py`
Expected: a `class Event(...)` (RootModel over the union) and `class PersonaProfile(BaseModel)`. If the root class is named `Model` instead, re-run with `--class-name Event` / `--class-name PersonaProfile` respectively and note it in the Makefile (Task 6).

- [ ] **Step 5: Create `packages/voice/contracts_gen/__init__.py`** (hand-written, NOT generated)

```python
"""Pydantic models GENERATED from @stark-ai/contracts. Do not edit the generated modules."""

from contracts_gen.events import Event
from contracts_gen.persona import PersonaProfile

__all__ = ["Event", "PersonaProfile"]
```

- [ ] **Step 6: Smoke-test imports**

Run: `cd packages/voice && ./.venv/bin/python -c "from contracts_gen import Event, PersonaProfile; print('ok')"`
Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add packages/voice/requirements.txt packages/voice/contracts_gen
git commit -m "feat(voice): generated Pydantic contract models from @stark-ai/contracts"
```

---

### Task 6: Python contract tests + root Makefile

**Files:**
- Test: `packages/voice/tests/test_contracts.py`
- Create: `Makefile` (repo root)

- [ ] **Step 1: Write `packages/voice/tests/test_contracts.py`**

```python
"""Contract tests: golden fixtures from @stark-ai/contracts validate against generated Pydantic models.

This is the Python half of the anti-drift lock (see docs/mark-r/SLICE-0-SPEC.md §5).
"""
import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from contracts_gen import Event, PersonaProfile

FIXTURES = Path(__file__).resolve().parents[2] / "contracts" / "fixtures"


def fixtures(group: str, sub: str) -> list[Path]:
    files = sorted((FIXTURES / group / sub).glob("*.json"))
    assert files, f"no fixtures found in {group}/{sub}"
    return files


@pytest.mark.parametrize("path", fixtures("events", "valid"), ids=lambda p: p.name)
def test_valid_event_fixture_validates(path: Path) -> None:
    Event.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("events", "invalid"), ids=lambda p: p.name)
def test_invalid_event_fixture_is_rejected(path: Path) -> None:
    with pytest.raises(ValidationError):
        Event.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("persona", "valid"), ids=lambda p: p.name)
def test_valid_persona_fixture_validates(path: Path) -> None:
    PersonaProfile.model_validate(json.loads(path.read_text()))


@pytest.mark.parametrize("path", fixtures("persona", "invalid"), ids=lambda p: p.name)
def test_invalid_persona_fixture_is_rejected(path: Path) -> None:
    with pytest.raises(ValidationError):
        PersonaProfile.model_validate(json.loads(path.read_text()))
```

- [ ] **Step 2: Run the tests**

Run: `cd packages/voice && ./.venv/bin/pytest tests/test_contracts.py -v`
Expected: PASS — all valid fixtures validate, all invalid fixtures raise `ValidationError`. If an invalid fixture unexpectedly PASSES on the Python side, the generated schema is looser than Zod — investigate before proceeding (this is exactly the drift the lock exists to catch).

- [ ] **Step 3: Create root `Makefile`**

```make
VOICE_BIN := packages/voice/.venv/bin
CODEGEN_HEADER := \# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'.

.PHONY: codegen test-contracts

codegen: ## Zod → JSON Schema → Pydantic (run after ANY contract change)
	cd packages/contracts && npm run gen
	$(VOICE_BIN)/datamodel-codegen \
	  --input packages/contracts/dist-schema/events.schema.json \
	  --input-file-type jsonschema \
	  --output packages/voice/contracts_gen/events.py \
	  --output-model-type pydantic_v2.BaseModel \
	  --target-python-version 3.12 \
	  --disable-timestamp \
	  --custom-file-header "$(CODEGEN_HEADER)"
	$(VOICE_BIN)/datamodel-codegen \
	  --input packages/contracts/dist-schema/persona.schema.json \
	  --input-file-type jsonschema \
	  --output packages/voice/contracts_gen/persona.py \
	  --output-model-type pydantic_v2.BaseModel \
	  --target-python-version 3.12 \
	  --disable-timestamp \
	  --custom-file-header "$(CODEGEN_HEADER)"

test-contracts: ## contract tests on both sides of the boundary
	cd packages/contracts && npm test
	cd packages/voice && ./.venv/bin/pytest tests/test_contracts.py -v
```

(If Task 5 Step 4 required `--class-name`, add the same flags here.)

- [ ] **Step 4: Verify codegen idempotency**

Run: `make codegen && git diff --exit-code packages/contracts/dist-schema packages/voice/contracts_gen`
Expected: exit 0, no diff — regeneration is deterministic.

- [ ] **Step 5: Run the full contract suite**

Run: `make test-contracts`
Expected: Vitest green + pytest green.

- [ ] **Step 6: Commit**

```bash
git add packages/voice/tests/test_contracts.py Makefile
git commit -m "test(voice): Python contract tests + root Makefile (codegen, test-contracts)"
```

---

### Task 7: CI — the anti-drift lock

**Files:**
- Create: `.github/workflows/contracts.yml`

- [ ] **Step 1: Write `.github/workflows/contracts.yml`**

```yaml
name: contracts

on:
  push:
    paths:
      - "packages/contracts/**"
      - "packages/voice/contracts_gen/**"
      - "packages/voice/tests/**"
      - ".github/workflows/contracts.yml"
  pull_request:

jobs:
  contract:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: Install TS dependencies
        run: npm ci
        working-directory: packages/contracts

      - name: TS contract tests
        run: npm test
        working-directory: packages/contracts

      - name: Regenerate JSON Schema and check sync
        run: |
          npm run gen
          git diff --exit-code dist-schema
        working-directory: packages/contracts

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"

      - name: Install Python dependencies (contract subset only)
        run: pip install "pydantic>=2" pytest "datamodel-code-generator==0.26.5"

      - name: Regenerate Pydantic models and check sync
        run: |
          datamodel-codegen \
            --input packages/contracts/dist-schema/events.schema.json \
            --input-file-type jsonschema \
            --output packages/voice/contracts_gen/events.py \
            --output-model-type pydantic_v2.BaseModel \
            --target-python-version 3.12 \
            --disable-timestamp \
            --custom-file-header "# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'."
          datamodel-codegen \
            --input packages/contracts/dist-schema/persona.schema.json \
            --input-file-type jsonschema \
            --output packages/voice/contracts_gen/persona.py \
            --output-model-type pydantic_v2.BaseModel \
            --target-python-version 3.12 \
            --disable-timestamp \
            --custom-file-header "# GENERATED from @stark-ai/contracts — DO NOT EDIT. Regenerate with 'make codegen'."
          git diff --exit-code packages/voice/contracts_gen

      - name: Python contract tests
        run: pytest tests/test_contracts.py -v
        working-directory: packages/voice
```

Notes: the datamodel-code-generator pin MUST match `packages/voice/requirements.txt`. The Python step installs only the contract-test subset (the full voice requirements pull LiveKit and are not needed here). The `--custom-file-header` strings must be byte-identical to the Makefile's, or the sync check fails. If Task 5 Step 4 required `--class-name`, mirror it here.

- [ ] **Step 2: Commit and push**

```bash
git add .github/workflows/contracts.yml
git commit -m "ci: contract sync check and dual-side contract tests"
git push origin main
```

- [ ] **Step 3: Verify CI is green**

Run: `gh run list --repo ai-ghostwriter/stark_ai --limit 1` then `gh run watch <id>` (or re-check after a minute).
Expected: workflow `contracts` concludes `success`.

---

## Acceptance criteria (adapted from SLICE-0-SPEC §7 for Option A scope)

1. `cd packages/contracts && npm test` green: every valid fixture parses, every invalid fixture is rejected, all 12 event types covered.
2. `cd packages/voice && ./.venv/bin/pytest tests/test_contracts.py` green: the SAME fixtures validate/fail against the generated Pydantic models.
3. `make codegen` is idempotent: running it twice leaves `git diff` clean.
4. Editing `src/events.ts` without running `make codegen` makes CI fail on the diff check (the anti-drift lock).
5. No runtime behavior change: nothing in `packages/core`, `packages/ui`, or the voice agent imports the new package yet (that starts in Slice 1/6).
