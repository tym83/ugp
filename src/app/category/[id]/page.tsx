import RoundRobinStandings from "@/components/RoundRobinStandings";
import BracketViewer from "@/components/BracketViewer";
import { parsePlacesOverride } from "@/lib/domain/roundRobin";
import { IN_BRACKET } from "@/lib/domain/bracketStatus";
import { prisma } from "@/lib/prisma";
import RebuildBracketButton from "@/components/RebuildBracketButton";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import Link from "next/link";
import type { Metadata } from "next";
import LiveMatches from "@/components/LiveMatches";
import { isMinor, maskName } from "@/lib/privacy";
import { levelLabel } from "@/lib/domain/levelLabel";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const category = await prisma.category.findFirst({ where: { OR: [{ slug: id }, { id }] }, include: { event: true } });
  if (!category) return { title: "Категория не найдена" };
  const weight = category.isAbsolute
    ? "абсолютка"
    : category.isOpenTop
      ? `свыше ${category.weightMin} кг`
      : `до ${category.weightMax} кг`;
  const sex = category.sex === "M" ? "муж" : "жен";
  const dateStr = new Date(category.event.date).toLocaleDateString("ru-RU");
  const lvl = levelLabel(category.level) ? ` · ${levelLabel(category.level)}` : "";
  const title = `${category.ageGroupLabel}${lvl} · ${sex} · ${category.discipline} · ${weight} — ${category.event.name}`;
  const description = `Сетка категории ${category.ageGroupLabel} (${sex}, ${category.discipline}, ${weight}) на турнире «${category.event.name}» · ${category.event.city} · ${dateStr}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ru_RU" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CategoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string | string[] }> }) {
  const { id: catParam } = await params;
  const { a } = await searchParams;
  const highlightedAthleteId = Array.isArray(a) ? a[0] : a;
  const category = await prisma.category.findFirst({ where: { OR: [{ slug: catParam }, { id: catParam }] }, include: { event: true } });
  if (!category) return <main className="p-8">Категория не найдена</main>;
  const id = category.id; // реальный id для запросов/действий

  // names for bracket slots come from every registration (withdrawn athletes keep their played bouts)
  const allRegs = await prisma.registration.findMany({
    where: { categoryId: id },
    include: { athlete: { include: { club: true } }, entry: { select: { paid: true } } },
    orderBy: { seed: "asc" },
  });
  const matches = await prisma.match.findMany({
    where: { categoryId: id },
    include: { result: { select: { winType: true } } },
    orderBy: [{ isBronzeMatch: "asc" }, { roundNumber: "asc" }, { positionInRound: "asc" }],
  });
  const regs = allRegs.filter((r) => IN_BRACKET.includes(r.status));
  const nameById = new Map(
    allRegs.map((r) => [r.athleteId, maskName(r.athlete.fullName, isMinor(r.athlete.birthDate))]),
  );


  const highlightedName = highlightedAthleteId ? nameById.get(highlightedAthleteId) : undefined;
  const firstMatch = highlightedAthleteId
    ? matches.find((m) => m.slotAAthleteId === highlightedAthleteId || m.slotBAthleteId === highlightedAthleteId)
    : undefined;

  // Данные для brackets-viewer.js: одна стадия олимпийки (+ финал за 3-е, если есть).
  const viewerData = (() => {
    if (category.bracketType === "ROUND_ROBIN" || matches.length === 0) return null;
    const opp = (athleteId: string | null, winnerId: string | null) =>
      athleteId
        ? { id: athleteId, result: winnerId ? (winnerId === athleteId ? ("win" as const) : ("loss" as const)) : undefined }
        : { id: null };
    return {
      stages: [
        {
          id: 0, tournament_id: 0, name: "Сетка", type: "single_elimination", number: 1,
          settings: { size: Math.max(regs.length, 2), seedOrdering: ["natural"], consolationFinal: matches.some((m) => m.isBronzeMatch) },
        },
      ],
      matches: matches.map((m) => ({
        id: m.id, stage_id: 0,
        group_id: m.isBronzeMatch ? 1 : 0,
        round_id: m.isBronzeMatch ? 1 : m.roundNumber,
        number: m.positionInRound,
        status: m.status === "COMPLETED" ? 4 : m.status === "RUNNING" ? 3 : 1,
        opponent1: opp(m.slotAAthleteId, m.winnerAthleteId),
        opponent2: opp(m.slotBAthleteId, m.winnerAthleteId),
        child_count: 0,
      })),
      matchGames: [],
      participants: regs.map((r) => ({ id: r.athleteId, tournament_id: 0, name: nameById.get(r.athleteId) ?? "?" })),
    };
  })();
  const highlightClass = (athleteId: string | null) =>
    athleteId && athleteId === highlightedAthleteId ? "bg-[#e3863d]/15 font-bold ring-2 ring-inset ring-[#e3863d] scroll-mt-24" : "";

  const user = await getCurrentUser();
  const isStaff = hasRole(user, "ORGANIZER", "ADMIN", "MAT_COORDINATOR");
  const isReferee = hasRole(user, "REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN");

  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/event/${category.event.slug ?? category.eventId}`} className="text-sm text-[#e3863d] hover:brightness-125">← {category.event.name}</Link>
      <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">
        {category.ageGroupLabel}{levelLabel(category.level) ? ` · ${levelLabel(category.level)}` : ""} · {category.sex === "M" ? "муж" : "жен"} · {category.discipline} ·{" "}
        {category.isAbsolute ? "абсолютка" : category.isOpenTop ? `свыше ${category.weightMin}` : `до ${category.weightMax}`} кг
      </h1>
      {highlightedName && (
        <p className="mt-1 text-sm text-[#e3863d]">
          Показан участник: {highlightedName} · <Link href={`/category/${encodeURIComponent(catParam)}`} className="underline">снять выделение</Link>
        </p>
      )}
      <p className="text-sm text-[#cec8bc]">
        Формат: {category.bracketType === "SINGLE_ELIM" ? "олимпийка" : "круговая"} · правила: {category.ruleFormat} ·
        схватка {category.boutSeconds}s · допущено: {regs.length}
      </p>

      {(isStaff || isReferee) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isStaff && (
            <RebuildBracketButton categoryId={id} hasBracket={matches.length > 0} className="rounded bg-[#e3863d] px-4 py-2 text-sm font-bold uppercase tracking-wide text-black hover:brightness-110" />
          )}
          {isReferee && matches.length > 0 && (
            <Link href={`/judge/${category.slug ?? id}`} className="rounded border border-white/25 px-4 py-2 text-sm hover:bg-white/10">Судейский пульт</Link>
          )}
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Участники</h2>
        <ol className="ml-6 list-decimal text-sm">
          {regs.map((r) => (
            <li key={r.id} className={highlightClass(r.athleteId)} id={!firstMatch && r.athleteId === highlightedAthleteId ? `a-${highlightedAthleteId}` : undefined}>{maskName(r.athlete.fullName, isMinor(r.athlete.birthDate))} <span className="text-[#8a8378]">({r.athlete.club?.name ?? "—"}, {r.actualWeight ?? r.declaredWeight} кг)</span>
              <span className={"ml-2 rounded px-1.5 py-0.5 text-[10px] font-semibold " + (r.entry?.paid ? "bg-green-500/20 text-green-400" : "bg-amber-500/20 text-amber-400")}>{r.entry?.paid ? "оплачено" : "не оплачено"}</span>
            </li>
          ))}
        </ol>
      </section>

      {matches.length > 0 && (
        <section className="mt-6">
          <LiveMatches categoryId={id} />
        </section>
      )}

      {matches.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Сетка</h2>
          {category.bracketType === "ROUND_ROBIN" ? <>
            <ol className="space-y-3">{matches.map((m, i) => <li key={m.id} id={firstMatch?.id === m.id ? `a-${highlightedAthleteId}` : undefined} className={highlightClass(m.slotAAthleteId) || highlightClass(m.slotBAthleteId)}>Схватка {i + 1}: {nameById.get(m.slotAAthleteId ?? "") ?? "—"} — {nameById.get(m.slotBAthleteId ?? "") ?? "—"} · Победитель: {nameById.get(m.winnerAthleteId ?? "") ?? "—"}</li>)}</ol>
            <RoundRobinStandings highlightedAthleteId={highlightedAthleteId} publicView matches={matches.map((m) => ({ a: m.slotAAthleteId, b: m.slotBAthleteId, winner: m.winnerAthleteId, status: m.status, winType: m.result?.winType }))} override={parsePlacesOverride(category.placesOverride)} names={Object.fromEntries(nameById)} />
          </> : viewerData && <BracketViewer data={viewerData} highlightedAthleteId={highlightedAthleteId} />}
        </section>
      )}
    </div>
    </main>
  );
}
