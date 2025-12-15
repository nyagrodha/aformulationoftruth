// server.ts — Solar-accurate theme synced to Pondicherry
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { serveDir } from "https://deno.land/std@0.224.0/http/file_server.ts";

const PORT = 8000;

// Pondicherry coordinates
const LAT = 11.9416;
const LON = 79.8083;

// Cache for solar data (6 hour TTL)
let cache: { timestamp: number; data: { sunrise: Date; sunset: Date } } | null = null;

async function getSunData() {
  const url =
    `https://api.open-meteo.com/v1/astronomy?latitude=${LAT}&longitude=${LON}&daily=sunrise,sunset&timezone=auto`;

  const res = await fetch(url);
  const json = await res.json();

  const sunrise = new Date(json.daily.sunrise[0]);
  const sunset  = new Date(json.daily.sunset[0]);

  return { sunrise, sunset };
}

async function getCachedSunData() {
  // Cache for 6 hours to avoid excessive API calls
  if (cache && Date.now() - cache.timestamp < 6 * 60 * 60 * 1000) {
    return cache.data;
  }

  const data = await getSunData();
  cache = { timestamp: Date.now(), data };
  return data;
}

// Define "warm / cool / noir" according to solar position
function pickPalette(now: Date, sunrise: Date, sunset: Date) {
  const t = now.getTime();

  // Dawn conditions around Pondicherry
  const dawnStart = sunrise.getTime() - 40 * 60 * 1000; // 40 minutes before sunrise
  const dawnEnd   = sunrise.getTime() + 40 * 60 * 1000; // 40 minutes after sunrise

  // Dusk: gold→wine atmospheric shift
  const duskStart = sunset.getTime() - 40 * 60 * 1000;
  const duskEnd   = sunset.getTime() + 60 * 60 * 1000;

  if (t >= dawnStart && t <= dawnEnd) return "warm";  // gentler palette in the early sun
  if (t > dawnEnd && t < duskStart)   return "cool";  // daytime oxidation
  return "noir";                                      // dusk + night fall into noir palette
}

async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // Serve static files
  if (url.pathname.startsWith("/static/") ||
      url.pathname.startsWith("/css/") ||
      url.pathname.startsWith("/js/") ||
      url.pathname.startsWith("/favicons/") ||
      url.pathname.endsWith(".css") ||
      url.pathname.endsWith(".js")) {
    return serveDir(req, {
      fsRoot: "public",
      urlRoot: "",
    });
  }

  // Check if request is from .onion (Tor) - force noir theme
  const host = req.headers.get("host") || "";
  let palette: string;

  if (host.endsWith(".onion")) {
    palette = "noir";  // Forced noir for Tor onion users
  } else {
    // Get solar data (cached) and determine palette
    const { sunrise, sunset } = await getCachedSunData();
    const now = new Date();
    palette = pickPalette(now, sunrise, sunset);
  }

  // Read and serve the HTML with injected palette
  const html = await Deno.readTextFile("./public/reimagined.html");

  // Inject theme into body tag
  const themedHtml = html.replace(
    /<body([^>]*)>/,
    `<body$1 data-palette="${palette}">`
  );

  return new Response(themedHtml, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

console.log(`🌅 Solar-accurate server running at http://localhost:${PORT}/`);
console.log(`📍 Synced to Pondicherry (${LAT}, ${LON})`);
console.log(`🎨 Theme switches based on sun position:`);
console.log(`   - Dawn (±40min from sunrise):  warm`);
console.log(`   - Day (dawn → dusk):          cool`);
console.log(`   - Dusk/Night (±40/60min):     noir`);
console.log(`🧅 .onion requests always serve:   noir`);

serve(handler, { port: PORT });
