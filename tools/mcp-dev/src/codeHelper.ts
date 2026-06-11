import type { RunFile, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";
import { runFile as defaultRunFile } from "./runner.js";

export const codeHelperSchema = {
  type: "object",
  properties: {
    action: { type: "string", enum: ["run", "write", "edit", "explain", "build", "optimize", "screen_debug", "auto"] },
    file_path: { type: "string" },
    args: { type: "array", items: { type: "string" } },
    timeout: { type: "number" },
  },
};

export function createCodeHelper(deps: { runFile?: RunFile } = {}) {
  const runFile = deps.runFile ?? defaultRunFile;
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const action = String(args.action ?? "run").toLowerCase();
    if (action !== "run") {
      return failure("LLM_ACTION_UNSUPPORTED", `${action} belongs to the brain, not the tool. This MCP server only runs deterministic code actions.`);
    }
    const filePath = String(args.file_path ?? "").trim();
    if (!filePath) return failure("MISSING_FILE_PATH", "Provide file_path to run.");
    const cliArgs = Array.isArray(args.args) ? args.args.map(String) : [];
    const timeoutMs = Math.max(1000, Math.min(120_000, Number(args.timeout ?? 30) * 1000));
    try {
      const result = await runFile(filePath, cliArgs, timeoutMs);
      return success({ filePath, args: cliArgs, exitCode: result.code, stdout: result.stdout, stderr: result.stderr });
    } catch (error) {
      return failure("RUN_FAILED", "Code run failed.", errorMessage(error));
    }
  };
}
