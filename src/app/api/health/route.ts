import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * Lightweight liveness probe. Does NOT touch the database or any external
 * service — it only confirms the Next.js server is up and answering. Public
 * (see middleware PUBLIC_PATHS) so uptime monitors can hit it without a login.
 */
export async function GET() {
  return NextResponse.json({ status: "ok", ts: new Date().toISOString() });
}
