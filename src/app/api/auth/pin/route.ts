import { NextResponse } from "next/server";
import { setSessionCookie, verifyPin } from "@/lib/session";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { pin?: string } | null;
  if (!body?.pin || !verifyPin(body.pin)) {
    return NextResponse.json({ error: "Invalid PIN" }, { status: 401 });
  }
  await setSessionCookie();
  return NextResponse.json({ ok: true });
}
