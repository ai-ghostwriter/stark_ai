export const DEFAULT_ALLOWED_COMMANDS = new Set([
  "git",
  "npm",
  "pnpm",
  "yarn",
  "python",
  "pytest",
  "codex",
  "claude",
]);

export function assertAllowedCommand(
  command: readonly string[],
  allowed: ReadonlySet<string> = DEFAULT_ALLOWED_COMMANDS,
): void {
  if (command.length === 0) {
    throw new Error("Command list is empty.");
  }

  const executable = command[0];
  if (!executable) {
    throw new Error("Command executable is missing.");
  }

  if (executable.includes("/") || executable.includes("\\") || executable.trim() !== executable) {
    throw new Error(`Command '${executable}' is not allowed.`);
  }

  if (!allowed.has(executable)) {
    throw new Error(`Command '${executable}' is not allowed.`);
  }
}
