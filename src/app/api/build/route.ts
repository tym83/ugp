import { NextRequest, NextResponse } from "next/server";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";

export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  const res = await buildBracketForCategory(categoryId);
  return NextResponse.json(res);
}
