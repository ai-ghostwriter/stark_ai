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

## Implementation Slices

The first slice adds structure, policy, prompt/task libraries, and workflow skeletons. It does not yet connect voice commands directly to autonomous code mutation.

The next slice should wire `packages/core/src/workflows/fridayWorkflow.ts` into explicit tool calls, after approval gates and logging have tests around them.
