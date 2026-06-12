import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeFridayLog } from "../src/logging/fridayLogger.js";

const filePath = join(process.cwd(), "logs", "friday.test.jsonl");

afterEach(() => {
  rmSync(filePath, { force: true });
});

describe("writeFridayLog", () => {
  it("appende record JSONL con timestamp e payload", () => {
    writeFridayLog(
      { agent: "architect", event: "plan.created", payload: { request: "analizza repo" } },
      { filePath, timestamp: "2026-06-12T10:00:00.000Z" },
    );
    writeFridayLog(
      { agent: "reviewer", event: "diff.reviewed", level: "warn", payload: { warnings: 2 } },
      { filePath, timestamp: "2026-06-12T10:01:00.000Z" },
    );

    const lines = readFileSync(filePath, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0] as string)).toEqual({
      timestamp: "2026-06-12T10:00:00.000Z",
      level: "info",
      agent: "architect",
      event: "plan.created",
      payload: { request: "analizza repo" },
    });
    expect(JSON.parse(lines[1] as string)).toEqual({
      timestamp: "2026-06-12T10:01:00.000Z",
      level: "warn",
      agent: "reviewer",
      event: "diff.reviewed",
      payload: { warnings: 2 },
    });
  });
});
