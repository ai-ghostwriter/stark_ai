import { describe, expect, it, vi } from "vitest";
import { createReminder } from "../src/reminder.js";
import { createSendMessage } from "../src/sendMessage.js";
import { createWeatherReport } from "../src/weatherReport.js";

describe("mcp-productivity send_message", () => {
  it("drafts messages and refuses real send without explicit confirm flag", async () => {
    const open = vi.fn(async () => undefined);
    const tool = createSendMessage({ open });

    await expect(tool({ platform: "whatsapp", receiver: "Pepper", message_text: "Ciao" })).resolves.toMatchObject({
      ok: true,
      data: { status: "drafted", sent: false },
    });
    await expect(tool({ platform: "whatsapp", receiver: "Pepper", message_text: "Ciao", confirm: true })).resolves.toMatchObject({
      ok: false,
      error: { code: "AUTO_SEND_UNSUPPORTED" },
    });
  });
});

describe("mcp-productivity reminder", () => {
  it("stores reminders locally when native scheduling is unavailable", async () => {
    const saved: unknown[] = [];
    const tool = createReminder({
      now: () => new Date("2026-06-11T10:00:00Z"),
      scheduleNative: async () => ({ ok: false, reason: "no permission" }),
      appendLocal: async (entry) => { saved.push(entry); },
    });

    await expect(tool({ date: "2026-06-12", time: "09:30", message: "Check ads" })).resolves.toMatchObject({
      ok: true,
      data: { backend: "local_json" },
    });
    expect(saved).toHaveLength(1);
  });
});

describe("mcp-productivity weather_report", () => {
  it("uses Open-Meteo APIs and returns a spoken summary", async () => {
    const fetchJson = vi
      .fn()
      .mockResolvedValueOnce({ results: [{ name: "Rome", latitude: 41.9, longitude: 12.5 }] })
      .mockResolvedValueOnce({ current: { temperature_2m: 24, relative_humidity_2m: 55, wind_speed_10m: 8 } });
    const tool = createWeatherReport({ fetchJson });

    await expect(tool({ city: "Rome" })).resolves.toMatchObject({
      ok: true,
      data: { city: "Rome", summary: "Rome: 24°C, humidity 55%, wind 8 km/h" },
    });
  });
});
