import { prisma } from "@/lib/prisma";
import CompletedBoutForm from "./CompletedBoutForm";
import { getCurrentUser, hasRole } from "@/lib/auth/session";
import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import Link from "next/link";
import BoutForm from "./BoutForm";

export const dynamic = "force-dynamic";

const WIN_TYPES: { v: string; ru: string }[] = [
  { v: "SUBMISSION", ru: "Сдача" },
  { v: "POINTS", ru: "По очкам" },
  { v: "DECISION", ru: "Решением" },
  { v: "DQ", ru: "Дисквалификация" },
  { v: "NO_SHOW", ru: "Неявка" },
  { v: "INJURY", ru: "Травма" },
  { v: "WALKOVER", ru: "Без борьбы" },
];

export default async function JudgePage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!hasRole(user, "REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN")) {
    return <main className="p-8">Нужна роль судьи или организатора.</main>;
  }
  const isHeadJudge = hasRole(user, "ORGANIZER", "ADMIN");
  const category = await prisma.category.findFirst({ where: { OR: [{ slug: categoryId }, { id: categoryId }] } });
  if (!category) return <main className="p-8">Категория не найдена</main>;
  const catId = category.id;

  const regs = await prisma.registration.findMany({ where: { categoryId: catId }, include: { athlete: true } });
  const nameById = new Map(regs.map((r) => [r.athleteId, r.athlete.fullName]));
  const matches = await prisma.match.findMany({ where: { categoryId: catId }, include: { result: true }, orderBy: [{ roundNumber: "asc" }, { positionInRound: "asc" }] });

  const ready = matches.filter((m) => m.slotAAthleteId && m.slotBAthleteId && m.status !== "COMPLETED");
  const done = matches.filter((m) => m.status === "COMPLETED");
  const nm = (id: string | null) => (id ? nameById.get(id) ?? "—" : "—");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/category/${category.slug ?? catId}`} className="text-sm text-blue-600">← сетка</Link>
      <h1 className="text-xl font-bold mt-2">Судейский пульт</h1>
      <p className="text-sm text-gray-500 mb-4">{category.ageGroupLabel} · {category.discipline} · схватка {category.boutSeconds}s</p>

      <h2 className="font-semibold mb-2">Готовы к вводу ({ready.length})</h2>
      <div className="space-y-4">
        {ready.map((m) => (
          <BoutForm
            key={m.id}
            matchId={m.id}
            categoryId={catId}
            cmid={randomUUID()}
            aId={m.slotAAthleteId!}
            bId={m.slotBAthleteId!}
            aName={nm(m.slotAAthleteId)}
            bName={nm(m.slotBAthleteId)}
            roundLabel={`Круг ${m.roundNumber}${m.isBronzeMatch ? " · за 3-е" : ""}`}
            winTypes={WIN_TYPES}
          />
        ))}
        {ready.length === 0 && <p className="text-sm text-gray-500">Нет матчей, готовых к вводу (сгенерируйте сетку / ждите предыдущих).</p>}
      </div>

      <h2 className="font-semibold mt-6 mb-2">Завершённые ({done.length})</h2>
      <ul className="text-sm space-y-2">
        {done.map((m) => {
          const a = m.slotAAthleteId, b = m.slotBAthleteId;
          return (
            <li key={m.id} className="text-gray-700 border-b pb-2">
              Круг {m.roundNumber}{m.isBronzeMatch ? " (3-е)" : ""}: <b>{nm(m.winnerAthleteId)}</b>
              {a && b && <span className="text-gray-400"> ({nm(a)} / {nm(b)})</span>}
              {isHeadJudge && a && b && m.result && (
                <CompletedBoutForm
                  matchId={m.id}
                  aId={a}
                  bId={b}
                  aName={nm(a)}
                  bName={nm(b)}
                  winnerAthleteId={m.winnerAthleteId ?? ""}
                  winType={m.result.winType}
                  scoreA={m.result.scoreA}
                  scoreB={m.result.scoreB}
                  winTypes={WIN_TYPES}
                />
              )}
            </li>
          );
        })}
      </ul>
    </main>
  );
}
