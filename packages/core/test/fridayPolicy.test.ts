import { describe, expect, it } from "vitest";
import { assertAllowedCommand, DEFAULT_ALLOWED_COMMANDS } from "../src/policy/commandPolicy.js";
import { assertWorkspaceAllowed, defaultWorkspaceRoot, isWorkspaceInsideRoot } from "../src/policy/workspacePolicy.js";

describe("friday policies", () => {
  it("consente comandi allowlisted e rifiuta gli altri", () => {
    expect(() => assertAllowedCommand(["git", "status"])).not.toThrow();
    expect(() => assertAllowedCommand(["rm", "-rf", "/"])).toThrow(/not allowed/i);
    expect(DEFAULT_ALLOWED_COMMANDS.has("codex")).toBe(true);
  });

  it("rifiuta eseguibili con path o spazi", () => {
    expect(() => assertAllowedCommand(["/usr/bin/git", "status"])).toThrow(/not allowed/i);
    expect(() => assertAllowedCommand([" git", "status"])).toThrow(/not allowed/i);
  });

  it("valida il workspace root di default e accetta path interni", () => {
    const root = defaultWorkspaceRoot();
    const allowed = assertWorkspaceAllowed(`${root}/project-a`, root);
    expect(allowed).toContain("project-a");
    expect(isWorkspaceInsideRoot(`${root}/project-a`, root)).toBe(true);
  });

  it("rifiuta workspace esterni", () => {
    expect(() => assertWorkspaceAllowed("/tmp/random-project", "/Users/abstract/Documents/Claude/Projects/STARK-AI/workspaces")).toThrow(/outside allowed root/i);
    expect(isWorkspaceInsideRoot("/tmp/random-project", "/Users/abstract/Documents/Claude/Projects/STARK-AI/workspaces")).toBe(false);
  });
});
