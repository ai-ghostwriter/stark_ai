import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

export function defaultWorkspaceRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../../../../workspaces");
}

export function assertWorkspaceAllowed(cwd: string, root: string = defaultWorkspaceRoot()): string {
  const normalizedRoot = normalizePath(root);
  const normalizedCwd = normalizePath(cwd);
  const rel = relative(normalizedRoot, normalizedCwd);

  if (rel === "" || !rel.startsWith("..")) {
    return normalizedCwd;
  }

  throw new Error(`Workspace '${normalizedCwd}' is outside allowed root '${normalizedRoot}'.`);
}

function normalizePath(input: string): string {
  try {
    return realpathSync(resolve(input));
  } catch {
    return resolve(input);
  }
}

export function isWorkspaceInsideRoot(cwd: string, root: string = defaultWorkspaceRoot()): boolean {
  try {
    assertWorkspaceAllowed(cwd, root);
    return true;
  } catch {
    return false;
  }
}
