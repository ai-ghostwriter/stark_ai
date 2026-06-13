import { describe, expect, it, vi } from "vitest";
import { createMusicControl } from "../src/musicControl.js";

describe("music_control", () => {
  it("pubblica un evento ui.control sull'hub", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    const result = await control({ action: "set", value: 30 });

    expect(result).toMatchObject({ ok: true });
    expect(publish).toHaveBeenCalledTimes(1);
    const [url, messages] = publish.mock.calls[0]!;
    expect(url).toBe("ws://test:1234");
    const event = JSON.parse(messages[messages.length - 1]);
    expect(event).toMatchObject({ v: 1, type: "ui.control", target: "music", action: "set", value: 30 });
  });

  it("clampa value fuori range", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    await control({ action: "set", value: 250 });
    const event = JSON.parse(publish.mock.calls[0]![1].at(-1));
    expect(event.value).toBe(100);
  });

  it("ritorna HUB_UNAVAILABLE se l'hub non risponde", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish });

    await expect(control({ action: "pause" })).resolves.toMatchObject({
      ok: false,
      error: { code: "HUB_UNAVAILABLE" },
    });
  });

  it("rifiuta azioni non supportate", async () => {
    const control = createMusicControl({ hubUrl: "ws://test:1234", publish: vi.fn() });
    await expect(control({ action: "explode" })).resolves.toMatchObject({
      ok: false,
      error: { code: "UNSUPPORTED_ACTION" },
    });
  });
});
