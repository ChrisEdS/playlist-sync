import { NextResponse, type NextRequest } from "next/server";

const COOKIE_NAME = "ms_session";
const PUBLIC_EXACT = new Set([
  "/login",
  "/api/auth/pin",
  "/api/cron/sync",
  "/api/auth/spotify/callback",
  "/api/auth/tidal/callback",
]);

async function verify(signed: string, secret: string): Promise<boolean> {
  const i = signed.lastIndexOf(".");
  if (i < 0) return false;
  const value = signed.slice(0, i);
  const sig = signed.slice(i + 1);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  const expected = bufferToBase64Url(mac);
  return value === "ok" && timingSafeEqual(sig, expected);
}

function bufferToBase64Url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function pinDisabled(): boolean {
  const flag = (process.env.DISABLE_APP_PIN || "").toLowerCase();
  return flag === "1" || flag === "true" || flag === "yes";
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.includes(".") ||
    PUBLIC_EXACT.has(pathname)
  ) {
    return NextResponse.next();
  }

  // Single auth layer: Vercel Deployment Protection can replace the app PIN.
  if (pinDisabled()) {
    if (pathname === "/login") {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const secret = process.env.SESSION_SECRET || process.env.TOKEN_ENCRYPTION_KEY || "";
  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  const ok = Boolean(secret && cookie && (await verify(cookie, secret)));

  if (!ok) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
