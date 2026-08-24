import { prisma } from "@/lib/prisma";
import { submitResultAction } from "@/app/actions";
import { randomUUID } from "crypto";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function JudgePage({ params }: { params: Promise<{ categoryId: string }> }) {
  const { categoryId } = await params;
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) return <main className="p-8">Категория не найдена</main>;

  const regs = await prisma.registration.findMany({ where: { categoryId, status: "ADMITTED" }, include: { athlete: true } });
  const nameById = new Map(regs.map((r) => [r.athleteId, r.athlete.fullName]));
  const matches = await prisma.match.findMany({ where: { categoryId }, orderBy: [{ roundNumber: "asc" }, { positionInRound: "asc" }] });

  const ready = matches.filter((m) => m.slotAAthleteId && m.slotBAthleteId && m.status !== "COMPLETED");
  const done = matches.filter((m) => m.status === "COMPLETED");
  const winTypes = ["SUBMISSION", "POINTS", "DECISION", "DQ", "NO_SHOW", "INJURY"] as const;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <Link href={`/category/${categoryId}`} className="text-sm text-blue-600">← сетка</Link>
      <h1 className="text-xl font-bold mt-2">Судейский пульт</h1>
      <p className="text-sm text-gray-500 mb-4">{category.ageGroupLabel} · {category.discipline} · схватка {category.boutSeconds}s</p>

      <h2 className="font-semibold mb-2">Готовы к вводу ({ready.length})</h2>
      <div className="space-y-4">
        {ready.map((m) => {
          const a = m.slotAAthleteId!;
          const b = m.slotBAthleteId!;
          return (
            <form key={m.id} action={submitResultAction} className="rounded-lg border p-3">
              <input type="hidden" name="matchId" value={m.id} />
              <input type="hidden" name="categoryId" value={categoryId} />
              <input type="hidden" name="clientMutationId" value={randomUUID()} />
              <div className="text-xs text-gray-400 mb-2">Круг {m.roundNumber}{m.isBronzeMatch ? " · за 3-е" : ""}</div>
              <div className="flex flex-col gap-2 mb-2">
                <label className="flex items-center gap-2 text-lg">
                  <input type="radio" name="winnerAthleteId" value={a} required /> <span className="font-medium">{nameById.get(a)}</span>
                </label>
                <label className="flex items-center gap-2 text-lg">
                  <input type="radio" name="winnerAthleteId" value={b} /> <span className="font-medium">{nameById.get(b)}</span>
                </label>
              </div>
              <div className="flex items-center gap-2">
                <select name="winType" className="border rounded px-2 py-1 text-sm" defaultValue="SUBMISSION">
                  {winTypes.map((w) => <option key={w} value={w}>{w}</option>)}
                </select>
                <button className="rounded bg-green-600 px-4 py-2 text-white text-sm">Записать результат</button>
              </div>
            </form>
          );
        })}
        {ready.length === 0 && <p className="text-sm text-gray-500">Нет матчей, готовых к вводу (сгенерируйте сетку / ждите предыдущих).</p>}
      </div>

      <h2 className="font-semibold mt-6 mb-2">Завершённые ({done.length})</h2>
      <ul className="text-sm space-y-1">
        {done.map((m) => (
          <li key={m.id} className="text-gray-600">
            Круг {m.roundNumber}{m.isBronzeMatch ? " (3-е)" : ""}: <b>{nameById.get(m.winnerAthleteId ?? "") ?? "победитель"}</b>
          </li>
        ))}
      </ul>
    </main>
  );
}
