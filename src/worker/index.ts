import type { Weather, WeatherKind } from "../shared/types";
import { checkPassword, clearedCookie, isAuthed, sessionCookie } from "./auth";
import type { Result } from "./farm";
import * as v from "./validate";

export { Farm } from "./farm";

const BASE = "/sheep";
const API = `${BASE}/api`;

const json = (data: unknown, init: ResponseInit = {}): Response =>
  Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });

const error = (status: number, message: string): Response => json({ error: message }, { status });

function fromResult<T>(r: Result<T>): Response {
  return r.ok ? json(r.value) : error(r.status, r.error);
}

async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new v.BadInput("That wasn't valid JSON.");
  }
}

/**
 * Mutations must be same-origin JSON. The JSON content type forces a CORS preflight for
 * cross-site callers, and SameSite=Lax keeps the cookie off cross-site POSTs anyway.
 */
function sameOriginJson(request: Request, url: URL): boolean {
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) return false;
  if (request.method === "GET" || request.method === "HEAD") return true;
  const type = request.headers.get("Content-Type") ?? "";
  return type.startsWith("application/json") || request.headers.get("Content-Length") === "0";
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // workers.dev root, or a bare /sheep: send folks to the farm gate.
    if (path === "/" || path === BASE) return Response.redirect(`${url.origin}${BASE}/`, 302);

    if (!path.startsWith(`${API}/`)) return env.ASSETS.fetch(request);

    try {
      return await handleApi(request, env, url);
    } catch (err) {
      if (err instanceof v.BadInput) return error(400, err.message);
      console.error("api error", err);
      return error(500, "Something spooked the sheep. Try again?");
    }
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  const route = url.pathname.slice(API.length); // e.g. "/sheep/abc/pet"
  const method = request.method;

  if (!sameOriginJson(request, url)) return error(403, "Cross-site requests aren't allowed on the farm.");

  if (route === "/login" && method === "POST") {
    const body = (await readJson(request)) as { password?: unknown } | null;
    const password = typeof body?.password === "string" ? body.password : "";
    if (!(await checkPassword(password, env))) {
      await new Promise((r) => setTimeout(r, 400)); // gentle brake on guessing
      return error(401, "That's not the secret word...");
    }
    return json({ ok: true }, { headers: { "Set-Cookie": await sessionCookie(env) } });
  }

  if (route === "/logout" && method === "POST") {
    return json({ ok: true }, { headers: { "Set-Cookie": clearedCookie() } });
  }

  if (!(await isAuthed(request, env))) return error(401, "Who goes there?");

  const farm = env.FARM.getByName("farm");
  const origin = request.headers.get("X-Client-Id")?.slice(0, 64) ?? null;

  if (route === "/me" && method === "GET") return json({ ok: true });

  if (route === "/ws") {
    if (request.headers.get("Upgrade") !== "websocket") return error(426, "Expected a WebSocket");
    return farm.fetch(request);
  }

  if (route === "/state" && method === "GET") return json(await farm.getState());

  if (route === "/weather" && method === "GET") return json(await weather(request));

  if (route === "/farm" && method === "PATCH") {
    return fromResult(await farm.renameFarm(v.farmName(await readJson(request)), origin));
  }

  if (route === "/sheep" && method === "POST") {
    return fromResult(await farm.addSheep(v.newSheep(await readJson(request)), origin));
  }

  const sheepMatch = /^\/sheep\/([0-9a-f-]{36})(?:\/(pet|shear|unshear))?$/.exec(route);
  if (sheepMatch) {
    const [, id, action] = sheepMatch as unknown as [string, string, string | undefined];
    if (!action && method === "PATCH") return fromResult(await farm.updateSheep(id, v.sheepPatch(await readJson(request)), origin));
    if (!action && method === "DELETE") return fromResult(await farm.sellSheep(id, origin));
    if (action === "pet" && method === "POST") {
      const { deviceId, day } = v.petInput(await readJson(request));
      return fromResult(await farm.pet(id, deviceId, day, origin));
    }
    if (action === "shear" && method === "POST") return fromResult(await farm.shear(id, v.memory(await readJson(request)), origin));
    if (action === "unshear" && method === "POST") return fromResult(await farm.unshear(id, origin));
  }

  if (route === "/loom/start" && method === "POST") return fromResult(await farm.startLoom(origin));
  if (route === "/loom/collect" && method === "POST") return fromResult(await farm.collectLoom(origin));

  if (route === "/decor" && method === "POST") return fromResult(await farm.buyDecor(v.buyDecor(await readJson(request)), origin));
  const decorMatch = /^\/decor\/([0-9a-f-]{36})$/.exec(route);
  if (decorMatch) {
    const id = decorMatch[1]!;
    if (method === "PATCH") return fromResult(await farm.moveDecor(id, v.moveDecor(await readJson(request)), origin));
    if (method === "DELETE") return fromResult(await farm.removeDecor(id, origin));
  }

  return error(404, "Nothing out here but grass.");
}

// ---------- weather: make it rain on the farm when it rains where you are ----------

function weatherKind(code: number, windKmh: number): WeatherKind {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code === 45 || code === 48) return "fog";
  if (windKmh >= 30) return "windy";
  if (code >= 2) return "cloudy";
  return "sunny";
}

async function weather(request: Request): Promise<Weather> {
  const cf = request.cf as { latitude?: string; longitude?: string; city?: string } | undefined;
  const lat = Number(cf?.latitude);
  const lon = Number(cf?.longitude);
  const city = cf?.city ?? null;
  const fallback: Weather = { kind: "sunny", tempC: null, city, isDay: true };
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return fallback;

  const api = new URL("https://api.open-meteo.com/v1/forecast");
  api.searchParams.set("latitude", lat.toFixed(1));
  api.searchParams.set("longitude", lon.toFixed(1));
  api.searchParams.set("current", "temperature_2m,weather_code,is_day,wind_speed_10m");

  try {
    // Cache per ~10km grid cell for 15 minutes.
    const res = await fetch(api.toString(), { cf: { cacheTtl: 900, cacheEverything: true } });
    if (!res.ok) return fallback;
    const data = (await res.json()) as {
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number; wind_speed_10m?: number };
    };
    const c = data.current;
    if (!c || typeof c.weather_code !== "number") return fallback;
    return {
      kind: weatherKind(c.weather_code, c.wind_speed_10m ?? 0),
      tempC: typeof c.temperature_2m === "number" ? Math.round(c.temperature_2m) : null,
      city,
      isDay: c.is_day !== 0,
    };
  } catch {
    return fallback;
  }
}
