import { describe, expect, it, vi } from "vitest";
import { createComputerControl } from "../src/computerControl.js";
import { createComputerSettings } from "../src/computerSettings.js";
import { createDesktop } from "../src/desktop.js";

describe("computer_control", () => {
  it("sets macOS volume and excludes shutdown by design", async () => {
    const execFile = vi.fn().mockResolvedValue({ stdout: "", stderr: "" });
    const control = createComputerControl({ platform: "darwin", execFile });

    await expect(control({ action: "volume_set", value: 42 })).resolves.toMatchObject({ ok: true });
    await expect(control({ action: "shutdown" })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_ACTION" },
    });
  });
});

describe("computer_settings", () => {
  it("returns memory and disk information from Node dependencies", async () => {
    const settings = createComputerSettings({
      totalmem: () => 100,
      freemem: () => 40,
      cpus: () => [{ model: "cpu" }],
      diskUsage: async () => ({ total: 1000, free: 250 }),
      batteryInfo: async () => ({ available: false }),
    });

    const result = await settings({});

    expect(result).toMatchObject({
      ok: true,
      data: {
        memory: { totalBytes: 100, freeBytes: 40, usedBytes: 60 },
        disk: { totalBytes: 1000, freeBytes: 250, usedBytes: 750 },
      },
    });
  });
});

describe("desktop", () => {
  it("degrades gracefully when window listing is unavailable", async () => {
    const desktop = createDesktop({
      platform: "darwin",
      execFile: vi.fn().mockRejectedValue(new Error("permission denied")),
      screenshot: vi.fn(),
    });

    const result = await desktop({ action: "list_windows" });

    expect(result).toMatchObject({
      ok: true,
      data: { windows: [], unavailableReason: expect.stringContaining("permission denied") },
    });
  });
});
