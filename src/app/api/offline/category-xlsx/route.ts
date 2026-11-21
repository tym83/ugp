import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildEventSnapshot } from "@/lib/domain/snapshot";
import { buildCategoryWorkbook } from "@/lib/domain/bracketXlsx";
import { IN_BRACKET } from "@/lib/domain/bracketStatus";
import { organizerEvent } from "../guard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const categoryParam = req.nextUrl.searchParams.get("categoryId");
  if (!categoryParam) return NextResponse.json({ error: "Укажите категорию" }, { status: 400 });
  const category = await prisma.category.findFirst({
    where: { OR: [{ id: categoryParam }, { slug: categoryParam }] },
    select: { id: true, slug: true, eventId: true },
  });
  if (!category) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  const ev = await organizerEvent(category.eventId);
  if (ev instanceof NextResponse) return ev;

  const snapshot = await buildEventSnapshot(ev.eventId, { categoryId: category.id });
  const cat = snapshot.categories[0];
  if (!cat) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  const registrations = await prisma.registration.findMany({
    where: { categoryId: category.id, status: { in: IN_BRACKET } },
    include: { athlete: { include: { club: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const buf = await buildCategoryWorkbook(snapshot, cat, registrations.map((r) => ({
    fullName: r.athlete.fullName,
    birthYear: r.athlete.birthDate.getUTCFullYear(),
    club: r.athlete.club?.name ?? null,
    weight: r.actualWeight ?? r.declaredWeight,
    status: r.status,
  })));
  const slug = (category.slug ?? "").replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const filenameId = slug || category.id.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 40);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="category-${filenameId}-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
