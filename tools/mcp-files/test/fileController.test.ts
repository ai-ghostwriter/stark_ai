import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileController, fileControllerSchema } from "../src/fileController.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "stark-files-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("file_controller", () => {
  it("publishes a strict JSON input schema", () => {
    expect(fileControllerSchema).toMatchObject({
      type: "object",
      required: ["action", "path"],
      additionalProperties: false,
    });
  });

  it("lists files inside an allowed root", async () => {
    await writeFile(join(root, "note.txt"), "hello", "utf8");
    const tool = createFileController({ roots: [root] });

    const result = await tool({ action: "list", path: root });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({ path: root, entries: [expect.objectContaining({ name: "note.txt" })] });
  });

  it("rejects path traversal outside configured roots", async () => {
    const tool = createFileController({ roots: [root] });

    const result = await tool({ action: "list", path: join(root, "..") });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "PATH_OUTSIDE_ALLOWED_ROOTS" },
    });
  });

  it("moves files without deleting data", async () => {
    await writeFile(join(root, "source.txt"), "payload", "utf8");
    const tool = createFileController({ roots: [root] });

    const result = await tool({
      action: "move",
      path: join(root, "source.txt"),
      destination: join(root, "dest.txt"),
    });

    expect(result.ok).toBe(true);
    await expect(readFile(join(root, "dest.txt"), "utf8")).resolves.toBe("payload");
  });
}
);
