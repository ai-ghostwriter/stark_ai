import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { runGit } from "../src/tools/runners/git.js";

// realpathSync: su macOS tmpdir() è un symlink (/var → /private/var) e la
// workspace policy normalizza i path — i fixture devono già essere risolti.
const root = realpathSync(mkdtempSync(join(tmpdir(), "friday-git-")));
const inside = join(root, "proj");
mkdirSync(inside);

afterAll(() => rmSync(root, { recursive: true, force: true }));

describe("runGit", () => {
  it("rifiuta sottocomandi fuori whitelist", async () => {
    await expect(runGit(["push", "--force"], inside, { root })).rejects.toThrow(/non consentito/i);
  });

  it("rifiuta cwd fuori dal workspace root", async () => {
    await expect(runGit(["status"], tmpdir(), { root })).rejects.toThrow(/outside allowed root/i);
  });

  it("esegue git status in un repo dentro il root", async () => {
    const { spawnCommand } = await import("../src/tools/runners/spawnCommand.js");
    await spawnCommand("git", ["init", "-q"], { cwd: inside });
    const res = await runGit(["status", "--short"], inside, { root });
    expect(res.code).toBe(0);
  });
});
