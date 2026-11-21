import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/session";
import { findBracketConflicts } from "@/app/organizer-actions";
import { buildSlotEditRows, type SlotAthlete, type SlotMatchLite } from "@/app/roster-actions";
import { inBracket } from "@/lib/domain/bracketStatus";
import { categoryLabel } from "@/lib/domain/snapshot";
import Link from "next/link";
import BracketEdit from "../../BracketEdit";
import RosterPanel, { type RosterRow } from "../../RosterPanel";
import SlotEditor from "../../SlotEditor";

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
  const { seeds, conflicts } = hasBracket && !played ? await findBracketConflicts(catId) : { seeds: [], conflicts: [] };

  // Данные для «Правки сетки по схваткам»: схватки с результатами или без.
  const matches = hasBracket
    ? await prisma.match.findMany({
        where: { categoryId: catId },
        include: { result: { select: { id: true, winType: true } } },
        orderBy: [{ roundNumber: "asc" }, { positionInRound: "asc" }],
      })
    : [];
  const slotRows = await buildSlotEditRows(
    matches.map(
      (m): SlotMatchLite => ({
        id: m.id,
        roundNumber: m.roundNumber,
        positionInRound: m.positionInRound,
        isBronzeMatch: m.isBronzeMatch,
        isRoundRobin: m.isRoundRobin,
        status: m.status,
        slotAAthleteId: m.slotAAthleteId,
        slotBAthleteId: m.slotBAthleteId,
        slotAFromMatchId: m.slotAFromMatchId,
        slotBFromMatchId: m.slotBFromMatchId,
        winnerAthleteId: m.winnerAthleteId,
        hasResult: !!m.result,
        winType: m.result?.winType ?? null,
      }),
    ),
  );
  const slotted = [...new Set(matches.flatMap((m) => [m.slotAAthleteId, m.slotBAthleteId].filter((v): v is string => !!v)))];
  const slotAthletes: SlotAthlete[] = category.registrations
    .filter((r) => inBracket(r.status))
    .map((r) => ({ athleteId: r.athleteId, fullName: r.athlete.fullName }));
  const athleteNames: Record<string, string> = Object.fromEntries(category.registrations.map((r) => [r.athleteId, r.athlete.fullName]));

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
        locked={played ? "В категории уже есть результаты: состав можно менять, сетку — только по схваткам ниже." : null}
        rows={rows}
        slotted={slotted}
      />
      {hasBracket && (
        <section>
          <h2 className="mb-2 font-semibold">Правка сетки по схваткам</h2>
          <SlotEditor athletes={slotAthletes} names={athleteNames} rows={slotRows} />
        </section>
      )}
      {hasBracket && !played && (
        <section>
          <h2 className="mb-2 font-semibold">Расстановка в сетке</h2>
          <BracketEdit categoryId={catId} seeds={seeds} conflicts={conflicts} />
        </section>
      )}
    </main>
  );
}
