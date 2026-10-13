// "Who goes there?" — one shared password, remembered with a long-lived signed cookie.
//
// The cookie holds HMAC(COOKIE_SECRET, "farm-v1:" + password), so rotating either the
// password or the secret logs every device out.

export const COOKIE_NAME = "baaaah";
const COOKIE_PATH = "/sheep";
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60; // Chrome caps cookie lifetime at 400 days.

const encoder = new TextEncoder();

async function hmac(secret: string, message: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ]);
  return crypto.subtle.sign("HMAC", key, encoder.encode(message));
}

function base64url(buf: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function normalizePassword(p: string): string {
  // Phones love to capitalize the first letter; "Goopy" should still get you in.
  return p.trim().toLowerCase();
}

async function sessionToken(env: Env): Promise<string> {
  return base64url(await hmac(env.COOKIE_SECRET, `farm-v1:${normalizePassword(env.FARM_PASSWORD)}`));
}

/** Constant-time string comparison (hash both sides so lengths always match). */
async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const [ha, hb] = await Promise.all([hmac(secret, a), hmac(secret, b)]);
  return crypto.subtle.timingSafeEqual(ha, hb);
}

function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim();
  }
  return null;
}

export async function isAuthed(request: Request, env: Env): Promise<boolean> {
  const got = readCookie(request, COOKIE_NAME);
  if (!got) return false;
  return safeEqual(got, await sessionToken(env), env.COOKIE_SECRET);
}

export async function checkPassword(password: string, env: Env): Promise<boolean> {
  return safeEqual(normalizePassword(password), normalizePassword(env.FARM_PASSWORD), env.COOKIE_SECRET);
}

export async function sessionCookie(env: Env): Promise<string> {
  return `${COOKIE_NAME}=${await sessionToken(env)}; Path=${COOKIE_PATH}; Max-Age=${MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;
}

export function clearedCookie(): string {
  return `${COOKIE_NAME}=; Path=${COOKIE_PATH}; Max-Age=0; HttpOnly; Secure; SameSite=Lax`;
}
