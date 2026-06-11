import { describe, expect, it, vi } from "vitest";
import { createOpenApp, openAppSchema } from "../src/openApp.js";

describe("open_app", () => {
  it("publishes a strict JSON input schema", () => {
    expect(openAppSchema).toMatchObject({
      type: "object",
      required: ["appName"],
      additionalProperties: false,
    });
  });

  it("normalizes aliases and uses macOS open -a first", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const openApp = createOpenApp({ platform: "darwin", execFile, which: vi.fn() });

    const result = await openApp({ appName: "calculator" });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected success");
    expect(result.data).toMatchObject({ requested: "calculator", resolved: "Calculator", launched: true });
    expect(execFile).toHaveBeenCalledWith("open", ["-a", "Calculator"], expect.objectContaining({ timeout: 8000 }));
  });

  it("falls back to .app on macOS before returning a structured failure", async () => {
    const execFile = vi.fn()
      .mockRejectedValueOnce(new Error("not found"))
      .mockRejectedValueOnce(new Error("still not found"));
    const openApp = createOpenApp({ platform: "darwin", execFile, which: vi.fn() });

    const result = await openApp({ appName: "Missing App" });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("expected failure");
    expect(result.error).toMatchObject({ code: "APP_LAUNCH_FAILED" });
    expect(execFile).toHaveBeenNthCalledWith(2, "open", ["-a", "Missing App.app"], expect.any(Object));
  });
});
