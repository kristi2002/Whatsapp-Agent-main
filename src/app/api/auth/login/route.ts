import { NextRequest } from "next/server";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  checkPassword,
  createSessionToken,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  let password = "";
  try {
    const body = await request.json();
    password = String(body?.password ?? "");
  } catch {
    return Response.json({ error: "Bad request" }, { status: 400 });
  }

  const ok = await checkPassword(password);
  if (!ok) {
    return Response.json({ error: "Password errata" }, { status: 401 });
  }

  const token = await createSessionToken();
  const res = Response.json({ ok: true });
  const parts = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  res.headers.append("Set-Cookie", parts.join("; "));
  return res;
}
