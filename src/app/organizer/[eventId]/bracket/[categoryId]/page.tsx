import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/session";
import { findBracketConflicts } from "@/app/organizer-actions";
import { categoryLabel } from "@/lib/domain/snapshot";
import Link from "next/link";
import BracketEdit from "../../BracketEdit";
import RosterPanel, { type RosterRow } from "../../RosterPanel";

export const dynamic = "force-dynamic";

// Состав категории и её сетка: разобрать, добавить/убрать участников, сохранить сетку, развести пары.
export default async function CategoryRosterPage({
  params,
}: {
  params: Promise<{ eventId: string; categoryId: string }>;
}) {
  const { eventId: eventParam, categoryId } = await params;
  await requirePageRole("ORGANIZER", "ADMIN");

  const event = await prisma.event.findFirst({ where: { OR: [{ slug: eventParam }, { id: eventParam }] } });
  const category = await prisma.category.findFirst({
    where: { OR: [{ slug: categoryId }, { id: categoryId }] },
    include: {
      registrations: { include: { athlete: { include: { club: true } } }, orderBy: { createdAt: "asc" } },
      _count: { select: { matches: true } },
    },
  });
  if (!event || !category || category.eventId !== event.id) return <main className="p-8">Категория не найдена</main>;
  const catId = category.id;
  const hasBracket = category._count.matches > 0;
  const played = await prisma.match.count({ where: { categoryId: catId, status: "COMPLETED", result: { isNot: null } } });

  const rows: RosterRow[] = category.registrations.map((r) => ({
    registrationId: r.id,
    athleteId: r.athleteId,
    fullName: r.athlete.fullName,
    birthYear: r.athlete.birthDate.getUTCFullYear(),
    club: r.athlete.club?.name ?? null,
    weight: r.actualWeight ?? r.declaredWeight,
    status: r.status,
  }));
  const { seeds, conflicts } = hasBracket ? await findBracketConflicts(catId) : { seeds: [], conflicts: [] };

  return (
    <main className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <Link href={`/organizer/${event.slug ?? event.id}`} className="text-sm text-blue-600">← Пульт организатора</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Состав и сетка</h1>
          <a
            href={`/api/offline/category-xlsx?categoryId=${encodeURIComponent(catId)}`}
            className="rounded bg-emerald-700 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Скачать Excel
          </a>
        </div>
        <p className="text-sm text-gray-500">
          {categoryLabel(category)}
          {category.matNumber ? ` · ковёр ${category.matNumber}` : ""} ·{" "}
          <Link href={`/category/${category.slug ?? catId}`} className="text-blue-600">публичная сетка</Link>
        </p>
      </div>
      <RosterPanel
        categoryId={catId}
        hasBracket={hasBracket}
        locked={played ? "В категории уже есть результаты схваток — состав и сетку менять нельзя." : null}
        rows={rows}
      />
      {hasBracket && !played && (
        <section>
          <h2 className="mb-2 font-semibold">Расстановка в сетке</h2>
          <BracketEdit categoryId={catId} seeds={seeds} conflicts={conflicts} />
        </section>
      )}
    </main>
  );
}
