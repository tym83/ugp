import { NextRequest, NextResponse } from "next/server";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { rateLimit } from "@/lib/rate-limit";

// Мутация — только POST + роль. GET-мутации убраны (CSRF/анонимная порча сеток).
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasRole(user, "ORGANIZER", "ADMIN", "MAT_COORDINATOR")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Троттлинг тяжёлой мутации: 30/мин на пользователя.
  const rl = rateLimit(`build:${user.id}`, { limit: 30, windowMs: 60_000 });
  if (!rl.ok) {
    return NextResponse.json(
      { error: "rate_limited" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) } },
    );
  }
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? (await req.json().catch(() => ({})))?.categoryId;
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  try {
    const res = await buildBracketForCategory(categoryId);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String((e as Error).message) }, { status: 409 });
  }
}
