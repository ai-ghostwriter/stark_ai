import { describe, expect, it } from "vitest";
import { buildClaudeArgs } from "../src/tools/runners/claude.js";

describe("buildClaudeArgs", () => {
  it("print mode con tool di scrittura esplicitamente negati (spike 2026-06-12: i settings utente pre-approvano Write)", () => {
    expect(buildClaudeArgs()).toEqual(["-p", "--disallowedTools", "Edit,Write,NotebookEdit,Bash"]);
  });
});
