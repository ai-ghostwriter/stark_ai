import { afterEach, describe, it, expect, vi } from "vitest";
import { getTime } from "../src/tools/builtins/time.js";
import { readFileTool } from "../src/tools/builtins/readFile.js";
import { getWeather } from "../src/tools/builtins/weather.js";
import { writeFileSync, rmSync } from "node:fs";

afterEach(() => vi.restoreAllMocks());

describe("get_time", () => {
  it("restituisce una stringa con la timezone", () => {
    const out = getTime.handler({ timezone: "Europe/Rome" });
    expect(String(out)).toMatch(/Europe\/Rome/);
  });
  it("ripiega su Europe/Rome se la timezone è invalida", () => {
    const out = getTime.handler({ timezone: "Nope/Invalid" });
    expect(String(out)).toMatch(/Europe\/Rome/);
  });
});

describe("read_file", () => {
  it("legge un file esistente", () => {
    const p = "/tmp/jarvis_test_read.txt";
    writeFileSync(p, "ciao");
    const out = readFileTool.handler({ path: p });
    expect(String(out)).toBe("ciao");
    rmSync(p);
  });
  it("messaggio chiaro se il file non esiste", () => {
    const out = readFileTool.handler({ path: "/tmp/nope_jarvis_xyz.txt" });
    expect(String(out)).toMatch(/non.*trovat|errore/i);
  });
});

describe("get_weather", () => {
  it("restituisce meteo corrente per una città trovata", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ results: [{ latitude: 45.4642, longitude: 9.19, name: "Milano" }] }),
        } as Response)
        .mockResolvedValueOnce({
          json: async () => ({
            current: {
              temperature_2m: 21.5,
              wind_speed_10m: 8,
              relative_humidity_2m: 55,
            },
          }),
        } as Response),
    );

    const out = await getWeather.handler({ city: "Milano" });

    expect(String(out)).toContain("Milano");
    expect(String(out)).toContain("21.5");
  });

  it("indica quando la città non viene trovata", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) } as Response));

    const out = await getWeather.handler({ city: "Atlantide" });

    expect(String(out)).toMatch(/non trovata/i);
  });

  it("indica quando il forecast non ha current", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          json: async () => ({ results: [{ latitude: 45.4642, longitude: 9.19, name: "Milano" }] }),
        } as Response)
        .mockResolvedValueOnce({ json: async () => ({}) } as Response),
    );

    const out = await getWeather.handler({ city: "Milano" });

    expect(String(out)).toMatch(/meteo non disponibile/i);
  });
});
