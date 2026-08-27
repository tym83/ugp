import { prisma } from "@/lib/prisma";
import { buildBracketAction } from "@/app/actions";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import Link from "next/link";
import type { Metadata } from "next";
import LiveMatches from "@/components/LiveMatches";
import { isMinor, maskName } from "@/lib/privacy";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id }, include: { event: true } });
  if (!category) return { title: "Категория не найдена" };
  const weight = category.isAbsolute
    ? "абсолютка"
    : category.isOpenTop
      ? `свыше ${category.weightMin} кг`
      : `до ${category.weightMax} кг`;
  const sex = category.sex === "M" ? "муж" : "жен";
  const dateStr = new Date(category.event.date).toLocaleDateString("ru-RU");
  const title = `${category.ageGroupLabel} · ${sex} · ${category.discipline} · ${weight} — ${category.event.name}`;
  const description = `Сетка категории ${category.ageGroupLabel} (${sex}, ${category.discipline}, ${weight}) на турнире «${category.event.name}» · ${category.event.city} · ${dateStr}.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ru_RU" },
    twitter: { card: "summary", title, description },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const category = await prisma.category.findUnique({ where: { id }, include: { event: true } });
  if (!category) return <main className="p-8">Категория не найдена</main>;

  const regs = await prisma.registration.findMany({
    where: { categoryId: id, status: "ADMITTED" },
    include: { athlete: { include: { club: true } } },
    orderBy: { seed: "asc" },
  });
  const matches = await prisma.match.findMany({
    where: { categoryId: id },
    orderBy: [{ isBronzeMatch: "asc" }, { roundNumber: "asc" }, { positionInRound: "asc" }],
  });
  const nameById = new Map(
    regs.map((r) => [r.athleteId, maskName(r.athlete.fullName, isMinor(r.athlete.birthDate))]),
  );
  const slotName = (athleteId: string | null, fromId: string | null, winner: boolean) => {
    if (athleteId) return nameById.get(athleteId) ?? "?";
    if (fromId) return winner ? "победитель ▲" : "проигравший ▽";
    return "— (BYE)";
  };
  const rounds = [...new Set(matches.filter((m) => !m.isBronzeMatch).map((m) => m.roundNumber))].sort((a, b) => a - b);

  const user = await getCurrentUser();
  const isStaff = hasRole(user, "ORGANIZER", "ADMIN", "MAT_COORDINATOR");
  const isReferee = hasRole(user, "REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN");
  const generate = buildBracketAction.bind(null, id);

  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
    <div className="mx-auto max-w-4xl px-6 py-8">
      <Link href={`/event/${category.eventId}`} className="text-sm text-[#e3863d] hover:brightness-125">← {category.event.name}</Link>
      <h1 className="mt-2 text-2xl font-black uppercase tracking-tight">
        {category.ageGroupLabel} · {category.sex === "M" ? "муж" : "жен"} · {category.discipline} ·{" "}
        {category.isAbsolute ? "абсолютка" : category.isOpenTop ? `свыше ${category.weightMin}` : `до ${category.weightMax}`} кг
      </h1>
      <p className="text-sm text-[#cec8bc]">
        Формат: {category.bracketType === "SINGLE_ELIM" ? "олимпийка" : "круговая"} · правила: {category.ruleFormat} ·
        схватка {category.boutSeconds}s · допущено: {regs.length}
      </p>

      {(isStaff || isReferee) && (
        <div className="mt-4 flex flex-wrap gap-2">
          {isStaff && (
            <form action={generate}>
              <button className="rounded bg-[#e3863d] px-4 py-2 text-sm font-bold uppercase tracking-wide text-black hover:brightness-110">
                {matches.length ? "Пересобрать сетку" : "Сгенерировать сетку"}
              </button>
            </form>
          )}
          {isReferee && matches.length > 0 && (
            <Link href={`/judge/${id}`} className="rounded border border-white/25 px-4 py-2 text-sm hover:bg-white/10">Судейский пульт</Link>
          )}
        </div>
      )}

      <section className="mt-6">
        <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Участники</h2>
        <ol className="ml-6 list-decimal text-sm">
          {regs.map((r) => (
            <li key={r.id}>{maskName(r.athlete.fullName, isMinor(r.athlete.birthDate))} <span className="text-[#8a8378]">({r.athlete.club?.name ?? "—"}, {r.actualWeight ?? r.declaredWeight} кг)</span></li>
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
          <div className="flex gap-6 overflow-x-auto pb-2">
            {rounds.map((rn) => (
              <div key={rn} className="min-w-[220px]">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#cec8bc]">Круг {rn}</div>
                <div className="space-y-3">
                  {matches.filter((m) => m.roundNumber === rn && !m.isBronzeMatch).map((m) => (
                    <div key={m.id} className="rounded border border-white/10 bg-white/5 text-sm">
                      <div className={`border-b border-white/10 px-2 py-1 ${m.winnerAthleteId && m.winnerAthleteId === m.slotAAthleteId ? "font-bold text-[#e3863d]" : ""}`}>
                        {slotName(m.slotAAthleteId, m.slotAFromMatchId, m.slotAWinner)}
                      </div>
                      <div className={`px-2 py-1 ${m.winnerAthleteId && m.winnerAthleteId === m.slotBAthleteId ? "font-bold text-[#e3863d]" : ""}`}>
                        {slotName(m.slotBAthleteId, m.slotBFromMatchId, m.slotBWinner)}
                      </div>
                      <div className="border-t border-white/10 px-2 py-0.5 text-[10px] text-[#8a8378]">{m.status}{m.matNumber ? ` · ковёр ${m.matNumber}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {matches.some((m) => m.isBronzeMatch) && (
              <div className="min-w-[220px]">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#e3863d]">За 3-е место</div>
                {matches.filter((m) => m.isBronzeMatch).map((m) => (
                  <div key={m.id} className="rounded border border-[#e3863d]/40 bg-white/5 text-sm">
                    <div className="border-b border-white/10 px-2 py-1">{slotName(m.slotAAthleteId, m.slotAFromMatchId, m.slotAWinner)}</div>
                    <div className="px-2 py-1">{slotName(m.slotBAthleteId, m.slotBFromMatchId, m.slotBWinner)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
    </main>
  );
}
