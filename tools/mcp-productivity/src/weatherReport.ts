import type { FetchJson, ToolResult } from "./types.js";
import { errorMessage, failure, success } from "./types.js";

export const weatherReportSchema = {
  type: "object",
  properties: {
    city: { type: "string" },
    time: { type: "string" },
  },
  required: ["city"],
};

type GeoResponse = { results?: Array<{ name: string; latitude: number; longitude: number; country?: string }> };
type WeatherResponse = { current?: { temperature_2m: number; relative_humidity_2m: number; wind_speed_10m: number } };

export function createWeatherReport(deps: { fetchJson: FetchJson }) {
  return async (args: Record<string, unknown>): Promise<ToolResult> => {
    const city = String(args.city ?? "").trim();
    const when = String(args.time ?? "today").trim() || "today";
    if (!city) return failure("MISSING_CITY", "The city is missing for the weather report.");
    try {
      const geo = await deps.fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`) as GeoResponse;
      const place = geo.results?.[0];
      if (!place) return failure("CITY_NOT_FOUND", `City not found: ${city}`);
      const weather = await deps.fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,wind_speed_10m,relative_humidity_2m`) as WeatherResponse;
      const current = weather.current;
      if (!current) return failure("WEATHER_UNAVAILABLE", `Weather unavailable for ${place.name}`);
      const summary = `${place.name}: ${current.temperature_2m}°C, humidity ${current.relative_humidity_2m}%, wind ${current.wind_speed_10m} km/h`;
      return success({ city: place.name, requestedCity: city, when, current, summary });
    } catch (error) {
      return failure("WEATHER_FAILED", "Weather report failed.", errorMessage(error));
    }
  };
}
