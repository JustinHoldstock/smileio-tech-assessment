import { randomUUID } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const SESSION_COOKIE = "sid";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns an opaque per-browser identifier, minting one if absent.
 *
 * This is NOT authentication. The brief does not require a login system, and
 * clearing cookies yields a fresh identifier. Its job is to give the challenge
 * flow something to key an "outstanding question" slot on, so a client cannot
 * hold several questions at once or reroll one by refreshing. Abuse is bounded
 * by the global daily cap, not by this cookie.
 */
export function getOrCreateSessionId(c: Context): string {
  const existing = getCookie(c, SESSION_COOKIE);

  // Validate the shape before it reaches a Redis key: an attacker-controlled
  // cookie must not be able to inject separators and collide with other keys.
  if (existing !== undefined && UUID_PATTERN.test(existing)) {
    return existing;
  }

  const sessionId = randomUUID();

  setCookie(c, SESSION_COOKIE, sessionId, {
    httpOnly: true,
    // Only mark Secure over HTTPS, otherwise the cookie is dropped on
    // http://localhost during development.
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return sessionId;
}

function isHttps(c: Context): boolean {
  if (c.req.header("x-forwarded-proto") === "https") return true;

  try {
    return new URL(c.req.url).protocol === "https:";
  } catch {
    return false;
  }
}
