// dserver.ts — Solar-accurate, Tor-aware, continuous blending theme server (Deploy-ready)
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const PORT = 8000;

// Pondicherry coordinates
const LAT = 11.9416;
const LON = 79.8083;

// Cache for solar data (6 hour TTL) - for local development
let cache: { timestamp: number; data: { sunrise: Date; sunset: Date } } | null = null;

// Local weather coordinates (same as solar reference)
const WEATHER_LAT = LAT;  // Use Pondicherry coords
const WEATHER_LON = LON;

// Cache for weather data (30 minute TTL)
let weatherCache: { timestamp: number; data: any } | null = null;

async function fetchSun() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=sunrise,sunset&timezone=auto&forecast_days=1`;

  const r = await fetch(url);
  const j = await r.json();

  // Debug log
  console.log("API Response:", JSON.stringify(j, null, 2));

  return {
    sunrise: new Date(j.daily.sunrise[0]),
    sunset:  new Date(j.daily.sunset[0]),
  };
}

async function getCachedSun() {
  // Cache for 6 hours in local dev (Deno Deploy handles edge caching)
  if (cache && Date.now() - cache.timestamp < 6 * 60 * 60 * 1000) {
    return cache.data;
  }

  const data = await fetchSun();
  cache = { timestamp: Date.now(), data };
  return data;
}

// Compute sunphase ∈ [0, 1] where 0=sunrise, 1=sunset
function computeSunPhase(now: Date, sunrise: Date, sunset: Date): number {
  const t = now.getTime();
  const s1 = sunrise.getTime();
  const s2 = sunset.getTime();

  if (t <= s1) return 0;        // Before sunrise: phase 0
  if (t >= s2) return 1;        // After sunset: phase 1
  return (t - s1) / (s2 - s1);  // Linear interpolation sunrise→sunset
}

// Determine discrete palette zone for semantic reference
function pickPalette(phase: number): string {
  if (phase < 0.2) return "warm";   // Early morning
  if (phase > 0.8) return "noir";   // Late evening
  return "cool";                    // Daytime
}

// Fetch local weather data
async function fetchWeather() {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${WEATHER_LAT}&longitude=${WEATHER_LON}&current_weather=true&temperature_unit=celsius`;

  const r = await fetch(url);
  const j = await r.json();

  return {
    temperature: Math.round(j.current_weather.temperature),
    condition: j.current_weather.weathercode.toString(),
    timestamp: new Date().toISOString(),
  };
}

// Get cached weather data
async function getCachedWeather() {
  // Cache for 30 minutes
  if (weatherCache && Date.now() - weatherCache.timestamp < 30 * 60 * 1000) {
    return weatherCache.data;
  }

  const data = await fetchWeather();
  weatherCache = { timestamp: Date.now(), data };
  return data;
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // API: Weather endpoint
  if (url.pathname === "/api/weather") {
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

  // Serve static files
  if (url.pathname.startsWith("/static/") ||
      url.pathname.startsWith("/css/") ||
      url.pathname.startsWith("/js/") ||
      url.pathname.startsWith("/favicons/") ||
      url.pathname.startsWith("/images/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js") ||
      url.pathname.endsWith(".png") ||
      url.pathname.endsWith(".svg") ||
      url.pathname.endsWith(".webp") ||
      url.pathname.endsWith(".ico")) {
    return serveDir(req, {
      fsRoot: "public",
      urlRoot: "",
    });
  }

  const host = req.headers.get("host") || "";
  const now = new Date();

  // Tor override - force noir with deep night phase
  if (host.endsWith(".onion")) {
    const html = await renderWithTheme("noir", 0.95);
    return new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Solar logic
  const { sunrise, sunset } = await getCachedSun();
  const phase = computeSunPhase(now, sunrise, sunset);
  const palette = pickPalette(phase);

  const html = await renderWithTheme(palette, phase);
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

async function renderWithTheme(palette: string, phase: number): Promise<string> {
  // Read the HTML template
  const html = await Deno.readTextFile("./public/landing.html");

  // Inject sunphase and palette into body tag with CSS custom property
  const themedHtml = html.replace(
    /<body([^>]*)>/,
    `<body$1 data-sunphase="${phase.toFixed(3)}" data-palette="${palette}" style="--sunphase: ${phase.toFixed(3)};">`
  );

  return themedHtml;
}

console.log(`🌅 Solar-accurate server running at http://localhost:${PORT}/`);
console.log(`📍 Synced to Pondicherry (${LAT}, ${LON})`);
console.log(`🎨 Continuous sunphase blending:`);
console.log(`   - 0.0 (sunrise) → 0.2: warm`);
console.log(`   - 0.2 → 0.8: cool`);
console.log(`   - 0.8 → 1.0 (sunset): noir`);
console.log(`🧅 .onion requests: noir (phase 0.95)`);

serve(handler, { port: PORT });
