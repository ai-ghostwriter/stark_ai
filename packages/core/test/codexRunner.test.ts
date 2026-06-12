import { describe, expect, it } from "vitest";
import { buildCodexArgs } from "../src/tools/runners/codex.js";

describe("buildCodexArgs", () => {
  it("usa args sicuri di default", () => {
    const args = buildCodexArgs("hello", { cwd: "/tmp/workspace" });
    expect(args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "-C",
      "/tmp/workspace",
      "hello",
    ]);
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });

  it("aggiunge la sandbox workspace-write quando richiesta", () => {
    const args = buildCodexArgs("hello", { cwd: "/tmp/workspace", sandbox: "workspace-write" });
    expect(args).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "-s",
      "workspace-write",
      "-C",
      "/tmp/workspace",
      "hello",
    ]);
  });

  it("abilita la modalità unsafe solo se richiesta esplicitamente", () => {
    const args = buildCodexArgs("hello", { cwd: "/tmp/workspace", unsafe: true });
    expect(args).toContain("--dangerously-bypass-approvals-and-sandbox");
    expect(args).toContain("-s");
    expect(args).toContain("danger-full-access");
  });
});
