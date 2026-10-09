import { createHmac, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { env } from "./env";

const COOKIE_NAME = "ms_session";
const OAUTH_COOKIE = "ms_oauth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(value: string): string {
  const sig = createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
  return `${value}.${sig}`;
}

function verify(signed: string): string | null {
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const expected = createHmac("sha256", env.sessionSecret).update(value).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const value = verify(raw);
  return value === "ok";
}

export async function setSessionCookie() {
  const jar = await cookies();
  jar.set(COOKIE_NAME, sign("ok"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export type OAuthState = {
  provider: "spotify" | "tidal";
  state: string;
  codeVerifier?: string;
};

export async function setOAuthState(data: OAuthState) {
  const jar = await cookies();
  jar.set(OAUTH_COOKIE, sign(JSON.stringify(data)), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
}

export async function consumeOAuthState(): Promise<OAuthState | null> {
  const jar = await cookies();
  const raw = jar.get(OAUTH_COOKIE)?.value;
  jar.delete(OAUTH_COOKIE);
  if (!raw) return null;
  const value = verify(raw);
  if (!value) return null;
  try {
    return JSON.parse(value) as OAuthState;
  } catch {
    return null;
  }
}

export function verifyPin(pin: string): boolean {
  const expected = env.appPin;
  const a = Buffer.from(pin);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
