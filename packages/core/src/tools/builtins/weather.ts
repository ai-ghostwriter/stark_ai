import type { ToolDef } from "../../llm/types.js";

export const getWeather: ToolDef = {
  name: "get_weather",
  description: "Meteo attuale di una città (Open-Meteo, nessuna API key).",
  parameters: {
    type: "object",
    properties: { city: { type: "string" } },
    required: ["city"],
  },
  handler: async (args) => {
    const city = String(args.city ?? "");
    if (!city) return "Errore: città mancante.";
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
    ).then((r) => r.json() as Promise<{ results?: Array<{ latitude: number; longitude: number; name: string }> }>);
    const place = geo.results?.[0];
    if (!place) return `Città non trovata: ${city}`;
    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`,
    ).then((r) => r.json() as Promise<{ current?: { temperature_2m: number; wind_speed_10m: number; relative_humidity_2m: number } }>);
    const c = w.current;
    if (!c) return `Meteo non disponibile per ${place.name}`;
    return `${place.name}: ${c.temperature_2m}°C, umidità ${c.relative_humidity_2m}%, vento ${c.wind_speed_10m} km/h`;
  },
};
