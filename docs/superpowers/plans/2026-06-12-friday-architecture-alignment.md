# FRIDAY Architecture Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align STARK-AI with `FRIDAY_MASTER_SPEC.md` without renaming the existing monorepo packages.

**Architecture:** Keep `packages/core`, `packages/voice`, `packages/ui`, and `tools/mcp-*` as the runtime structure. Add explicit FRIDAY layers for prompts, task templates, workspace policy, command policy, JSONL logging, agent role wrappers, and workflow skeletons inside the current core.

**Tech Stack:** TypeScript, Node.js, Vitest, Markdown, existing STARK-AI monorepo layout.

---

### Task 1: Documentation and Static Structure

**Files:**
- Create: `docs/architecture/friday-alignment.md`
- Create: `logs/.gitkeep`
- Create: `workspaces/.gitkeep`
- Create: `prompts/architect.md`
- Create: `prompts/implementer.md`
- Create: `prompts/reviewer.md`
- Create: `.codex/tasks/analyze_repository.md`
- Create: `.codex/tasks/implement_feature.md`
- Create: `.codex/tasks/fix_bug.md`
- Create: `.codex/tasks/run_validation.md`

- [ ] **Step 1: Create alignment documentation**

Write `docs/architecture/friday-alignment.md` describing how the current monorepo maps to the FRIDAY master spec:

```markdown
# FRIDAY Architecture Alignment

STARK-AI follows `FRIDAY_MASTER_SPEC.md` as an architectural contract, without renaming the current monorepo packages.

## Runtime Mapping

| FRIDAY concept | Current path | Responsibility |
| --- | --- | --- |
| Voice gateway | `packages/voice` | LiveKit, Gemini Realtime, token server, Kokoro/offline voice bridge |
| Dashboard | `packages/ui` | React HUD and runtime selectors |
| Orchestrator / brain | `packages/core` | LLM routing, event bus, tools, agent workflows |
| MCP tools | `tools/mcp-*` | External tool servers |
| Prompt library | `prompts` | Agent system prompts |
| Codex task library | `.codex/tasks` | Repeatable implementation workflows |
| Execution logs | `logs` | JSONL records for agent/tool runs |
| Workspace root | `workspaces` | Approved root for external project workspaces |

## Alignment Rules

1. Preserve the existing package layout unless a future migration has a direct runtime benefit.
2. Put FRIDAY orchestration code in `packages/core/src`.
3. Keep voice code focused on conversation, not repository mutation.
4. Route code-changing work through explicit approval and policy checks.
5. Log every agent/tool execution with structured JSON.
```

- [ ] **Step 2: Add prompt files**

Create `prompts/architect.md`, `prompts/implementer.md`, and `prompts/reviewer.md` using the role contracts from `FRIDAY_MASTER_SPEC.md`.

- [ ] **Step 3: Add Codex task templates**

Create the four `.codex/tasks/*.md` files with concise, repeatable task instructions for analysis, implementation, bug fixes, and validation.

### Task 2: Policy Layer

**Files:**
- Create: `packages/core/src/policy/commandPolicy.ts`
- Create: `packages/core/src/policy/workspacePolicy.ts`
- Test: `packages/core/test/fridayPolicy.test.ts`

- [ ] **Step 1: Write failing tests**

Add tests for allowed commands, denied commands, workspace containment, and explicit workspace-root overrides.

- [ ] **Step 2: Implement command policy**

Implement:

```ts
export const DEFAULT_ALLOWED_COMMANDS = new Set(["git", "npm", "pnpm", "yarn", "python", "pytest", "codex", "claude"]);
export function assertAllowedCommand(command: readonly string[], allowed = DEFAULT_ALLOWED_COMMANDS): void;
```

- [ ] **Step 3: Implement workspace policy**

Implement:

```ts
export function defaultWorkspaceRoot(): string;
export function assertWorkspaceAllowed(cwd: string, root?: string): string;
```

### Task 3: Logging Layer

**Files:**
- Create: `packages/core/src/logging/fridayLogger.ts`
- Test: `packages/core/test/fridayLogger.test.ts`

- [ ] **Step 1: Write failing tests**

Verify JSONL append behavior and that log records include timestamp, agent, event, and payload.

- [ ] **Step 2: Implement logger**

Implement `writeFridayLog(record, opts)` with append-only JSONL output.

### Task 4: Safer Codex Runner

**Files:**
- Modify: `packages/core/src/tools/runners/codex.ts`
- Test: `packages/core/test/codexRunner.test.ts`

- [ ] **Step 1: Write failing tests**

Verify that safe mode does not include `--dangerously-bypass-approvals-and-sandbox`, and that explicit unsafe mode does.

- [ ] **Step 2: Refactor runner for argument construction**

Export a pure `buildCodexArgs(prompt, options)` function, and make `runCodex` use it.

### Task 5: Agent Role and Workflow Skeleton

**Files:**
- Create: `packages/core/src/agents/roles.ts`
- Create: `packages/core/src/workflows/fridayWorkflow.ts`
- Test: `packages/core/test/fridayWorkflow.test.ts`

- [ ] **Step 1: Write failing workflow tests**

Verify that implementation requests require approval before reaching implementation.

- [ ] **Step 2: Implement role definitions**

Define `architect`, `implementer`, and `reviewer` role metadata.

- [ ] **Step 3: Implement workflow skeleton**

Implement a pure planner that returns ordered steps and approval requirements without executing Claude, Codex, git, or tests yet.

### Task 6: Verification

**Files:**
- Modify only if tests reveal type or integration errors.

- [ ] **Step 1: Run focused tests**

Run:

```bash
cd packages/core && npm test -- fridayPolicy fridayLogger codexRunner fridayWorkflow
```

- [ ] **Step 2: Run typecheck**

Run:

```bash
cd packages/core && npm run typecheck
```

- [ ] **Step 3: Run full core test suite if focused tests pass**

Run:

```bash
cd packages/core && npm test
```

---

## Self-Review

Spec coverage:
- Voice remains in `packages/voice`; no runtime voice changes are needed for this alignment slice.
- Routing, approval, logging, workspace isolation, and Codex task library are represented.
- Full Claude/Codex execution orchestration is intentionally left as the next slice after the policy and workflow skeleton are testable.

Placeholder scan:
- No implementation placeholders are required for this slice.

Type consistency:
- Policy and logger APIs are intentionally small and pure, making them safe to introduce before wiring runtime behavior.
