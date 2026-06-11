import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileProcessor } from "../src/fileProcessor.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "stark-processor-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("file_processor", () => {
  it("extracts text and metadata from markdown", async () => {
    const path = join(root, "brief.md");
    await writeFile(path, "# Title\n\nhello world\n", "utf8");
    const tool = createFileProcessor({ roots: [root] });

    const result = await tool({ path, maxChars: 100 });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({
      type: "markdown",
      metadata: expect.objectContaining({ name: "brief.md", extension: ".md" }),
      text: expect.stringContaining("hello world"),
    });
  });

  it("parses JSON and returns a compact preview", async () => {
    const path = join(root, "data.json");
    await writeFile(path, JSON.stringify({ a: 1 }), "utf8");
    const tool = createFileProcessor({ roots: [root] });

    const result = await tool({ path });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({ type: "json", jsonType: "object" });
  });
});
