// Weather API endpoint for Madison, WI
// Deno Deploy compatible

// Madison, WI coordinates
const MADISON_LAT = 43.0731;
const MADISON_LON = -89.4012;

// Cache weather data (30 minute TTL)
let weatherCache: { timestamp: number; data: WeatherData } | null = null;

interface WeatherData {
  temperature: number;
  condition: string;
  timestamp: string;
}

async function fetchMadisonWeather(): Promise<WeatherData> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${MADISON_LAT}&longitude=${MADISON_LON}&current_weather=true&temperature_unit=fahrenheit`;

  const response = await fetch(url);
  const json = await response.json();

  return {
    temperature: Math.round(json.current_weather.temperature),
    condition: json.current_weather.weathercode.toString(),
    timestamp: new Date().toISOString(),
  };
}

async function getCachedWeather(): Promise<WeatherData> {
  // Cache for 30 minutes
  if (weatherCache && Date.now() - weatherCache.timestamp < 30 * 60 * 1000) {
    return weatherCache.data;
  }

  const data = await fetchMadisonWeather();
  weatherCache = { timestamp: Date.now(), data };
  return data;
}

export async function handleWeatherRequest(): Promise<Response> {
  try {
    const weather = await getCachedWeather();

    return new Response(JSON.stringify(weather), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "public, max-age=1800", // 30 minutes
      },
    });
  } catch (error) {
    console.error("Weather API error:", error);

    return new Response(
      JSON.stringify({ error: "Failed to fetch weather" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      }
    );
  }
}
