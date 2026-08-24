import { prisma } from "@/lib/prisma";
import { buildBracketAction } from "@/app/actions";
import Link from "next/link";

export const dynamic = "force-dynamic";

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
  const nameById = new Map(regs.map((r) => [r.athleteId, r.athlete.fullName]));
  const slotName = (athleteId: string | null, fromId: string | null, winner: boolean) => {
    if (athleteId) return nameById.get(athleteId) ?? "?";
    if (fromId) return winner ? "победитель ▲" : "проигравший ▽";
    return "— (BYE)";
  };
  const rounds = [...new Set(matches.filter((m) => !m.isBronzeMatch).map((m) => m.roundNumber))].sort((a, b) => a - b);

  const generate = buildBracketAction.bind(null, id);

  return (
    <main className="mx-auto max-w-4xl p-8">
      <Link href={`/event/${category.eventId}`} className="text-sm text-blue-600">← {category.event.name}</Link>
      <h1 className="text-2xl font-bold mt-2">
        {category.ageGroupLabel} · {category.sex === "M" ? "муж" : "жен"} · {category.discipline} ·{" "}
        {category.isAbsolute ? "абсолютка" : category.isOpenTop ? `свыше ${category.weightMin}` : `до ${category.weightMax}`} кг
      </h1>
      <p className="text-sm text-gray-500">
        Формат: {category.bracketType === "SINGLE_ELIM" ? "олимпийка" : "круговая"} · правила: {category.ruleFormat} ·
        схватка {category.boutSeconds}s · допущено: {regs.length}
      </p>

      <form action={generate} className="mt-4">
        <button className="rounded bg-blue-600 px-4 py-2 text-white text-sm">
          {matches.length ? "Пересобрать сетку" : "Сгенерировать сетку"}
        </button>
      </form>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Участники</h2>
        <ol className="list-decimal ml-6 text-sm">
          {regs.map((r) => (
            <li key={r.id}>{r.athlete.fullName} <span className="text-gray-400">({r.athlete.club?.name ?? "—"}, {r.actualWeight ?? r.declaredWeight} кг)</span></li>
          ))}
        </ol>
      </section>

      {matches.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-3">Сетка</h2>
          <div className="flex gap-6 overflow-x-auto">
            {rounds.map((rn) => (
              <div key={rn} className="min-w-[220px]">
                <div className="text-xs font-semibold text-gray-500 mb-2">Круг {rn}</div>
                <div className="space-y-3">
                  {matches.filter((m) => m.roundNumber === rn && !m.isBronzeMatch).map((m) => (
                    <div key={m.id} className="rounded border text-sm">
                      <div className={`px-2 py-1 border-b ${m.winnerAthleteId && m.winnerAthleteId === m.slotAAthleteId ? "font-bold" : ""}`}>
                        {slotName(m.slotAAthleteId, m.slotAFromMatchId, m.slotAWinner)}
                      </div>
                      <div className={`px-2 py-1 ${m.winnerAthleteId && m.winnerAthleteId === m.slotBAthleteId ? "font-bold" : ""}`}>
                        {slotName(m.slotBAthleteId, m.slotBFromMatchId, m.slotBWinner)}
                      </div>
                      <div className="px-2 py-0.5 text-[10px] text-gray-400 border-t">{m.status}{m.matNumber ? ` · ковёр ${m.matNumber}` : ""}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {matches.some((m) => m.isBronzeMatch) && (
              <div className="min-w-[220px]">
                <div className="text-xs font-semibold text-amber-600 mb-2">За 3-е место</div>
                {matches.filter((m) => m.isBronzeMatch).map((m) => (
                  <div key={m.id} className="rounded border border-amber-300 text-sm">
                    <div className="px-2 py-1 border-b">{slotName(m.slotAAthleteId, m.slotAFromMatchId, m.slotAWinner)}</div>
                    <div className="px-2 py-1">{slotName(m.slotBAthleteId, m.slotBFromMatchId, m.slotBWinner)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
