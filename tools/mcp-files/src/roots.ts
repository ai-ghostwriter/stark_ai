import { homedir } from "node:os";
import { resolve, sep } from "node:path";
import type { ToolResult } from "./types.js";
import { failure } from "./types.js";

export type RootConfig = {
  roots?: string[];
};

export function defaultRoots(): string[] {
  const home = homedir();
  return [`${home}/Desktop`, `${home}/Documents`, `${home}/Downloads`];
}

export function rootsFromEnv(): string[] {
  const raw = process.env.STARK_AI_MCP_FILE_ROOTS;
  if (!raw?.trim()) return defaultRoots();
  return raw.split(":").map((entry) => entry.trim()).filter(Boolean);
}

export function normalizeRoots(roots: string[]): string[] {
  return roots.map((root) => resolve(root));
}

export function resolveAllowedPath(path: string, roots: string[]): ToolResult<{ path: string }> {
  const target = resolve(path);
  const allowed = normalizeRoots(roots).some((root) => target === root || target.startsWith(`${root}${sep}`));
  if (!allowed) {
    return failure("PATH_OUTSIDE_ALLOWED_ROOTS", `Path is outside allowed roots: ${target}`, { roots: normalizeRoots(roots) });
  }
  return { ok: true, data: { path: target } };
}
