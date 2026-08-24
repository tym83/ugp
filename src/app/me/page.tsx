import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Мой кабинет",
  description: "Ближайшая схватка, ковёр и результаты участника.",
};

type Athlete = { id: string; fullName: string };

async function resolveAthletes(searchId?: string): Promise<{ list: Athlete[]; via: string }> {
  const user = await getCurrentUser();
  if (user) {
    const linked = await prisma.athlete.findUnique({ where: { userId: user.id }, select: { id: true, fullName: true } });
    if (linked) return { list: [linked], via: "user" };
    // авторизован, но профиль не привязан — попробуем по совпадению ФИО
    const byName = await prisma.athlete.findMany({ where: { fullName: user.fullName }, select: { id: true, fullName: true } });
    if (byName.length) return { list: byName, via: "name" };
  }
  if (searchId) {
    const a = await prisma.athlete.findUnique({ where: { id: searchId }, select: { id: true, fullName: true } });
    if (a) return { list: [a], via: "query" };
  }
  return { list: [], via: "none" };
}

function matchLabel(round: number, isBronze: boolean) {
  if (isBronze) return "за 3-е место";
  return `круг ${round}`;
}

export default async function MePage({ searchParams }: { searchParams: Promise<{ athleteId?: string }> }) {
  const { athleteId } = await searchParams;
  const user = await getCurrentUser();
  const { list } = await resolveAthletes(athleteId);

  if (!list.length) {
    return (
      <main className="mx-auto max-w-lg p-8">
        <h1 className="text-2xl font-bold mb-3">Мой кабинет</h1>
        {!user ? (
          <p className="text-sm text-gray-600">
            Войдите как участник, чтобы видеть свою ближайшую схватку.{" "}
            <Link href="/login" className="text-blue-600">Вход →</Link>
          </p>
        ) : (
          <p className="text-sm text-gray-600">Профиль участника не найден.</p>
        )}
        <p className="mt-3 text-sm">
          Или <Link href="/me/search" className="text-blue-600">найдите свою сетку по имени →</Link>
        </p>
      </main>
    );
  }

  const athleteIds = list.map((a) => a.id);
  const nameById = new Map(list.map((a) => [a.id, a.fullName]));

  // все матчи атлета(ов)
  const matches = await prisma.match.findMany({
    where: { OR: [{ slotAAthleteId: { in: athleteIds } }, { slotBAthleteId: { in: athleteIds } }] },
    include: { category: { include: { event: true } } },
    orderBy: [{ matNumber: "asc" }, { orderOnMat: "asc" }, { roundNumber: "asc" }],
  });

  // имена оппонентов
  const oppIds = new Set<string>();
  for (const m of matches) {
    if (m.slotAAthleteId && !athleteIds.includes(m.slotAAthleteId)) oppIds.add(m.slotAAthleteId);
    if (m.slotBAthleteId && !athleteIds.includes(m.slotBAthleteId)) oppIds.add(m.slotBAthleteId);
  }
  const opps = await prisma.athlete.findMany({ where: { id: { in: [...oppIds] } }, select: { id: true, fullName: true } });
  for (const o of opps) nameById.set(o.id, o.fullName);

  // сколько PENDING-схваток впереди на том же ковре (для ETA)
  const matNumbers = [...new Set(matches.filter((m) => m.matNumber != null).map((m) => m.matNumber!))];
  const pendingByMat = new Map<number, { orderOnMat: number | null }[]>();
  for (const mn of matNumbers) {
    const rows = await prisma.match.findMany({
      where: { matNumber: mn, status: "PENDING" },
      select: { orderOnMat: true },
    });
    pendingByMat.set(mn, rows);
  }

  const upcoming = matches.filter((m) => !(m.status === "COMPLETED" || m.winnerAthleteId));
  const past = matches.filter((m) => m.status === "COMPLETED" || m.winnerAthleteId);

  const eta = (m: (typeof matches)[number]): number | null => {
    if (m.matNumber == null || m.orderOnMat == null) return null;
    const ahead = (pendingByMat.get(m.matNumber) ?? []).filter(
      (x) => x.orderOnMat != null && x.orderOnMat < m.orderOnMat!
    ).length;
    return ahead;
  };

  const oppOf = (m: (typeof matches)[number]) => {
    const meIsA = m.slotAAthleteId && athleteIds.includes(m.slotAAthleteId);
    const oppId = meIsA ? m.slotBAthleteId : m.slotAAthleteId;
    return oppId ? (nameById.get(oppId) ?? "?") : "— (ожидается)";
  };

  return (
    <main className="mx-auto max-w-lg p-8">
      <h1 className="text-2xl font-bold mb-1">Мой кабинет</h1>
      <p className="text-sm text-gray-500 mb-6">{list.map((a) => a.fullName).join(", ")}</p>

      <section>
        <h2 className="text-lg font-semibold mb-2">Ближайшие схватки</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-gray-500">Пока нет назначенных схваток.</p>
        ) : (
          <ul className="space-y-3">
            {upcoming.map((m) => {
              const ahead = eta(m);
              return (
                <li key={m.id} className="rounded border p-3">
                  <div className="font-semibold">{oppOf(m)}</div>
                  <div className="text-sm text-gray-600">
                    {m.category.event.name} · {matchLabel(m.roundNumber, m.isBronzeMatch)}
                    {m.matNumber != null ? ` · ковёр ${m.matNumber}` : ""}
                  </div>
                  {ahead != null && (
                    <div className="mt-1 text-xs text-amber-700">
                      {ahead === 0 ? "вы следующий на ковре" : `примерно через ${ahead} ${schvatok(ahead)} на ковре`}
                    </div>
                  )}
                  <Link href={`/category/${m.categoryId}`} className="mt-1 inline-block text-xs text-blue-600">сетка →</Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold mb-2">Результаты</h2>
        {past.length === 0 ? (
          <p className="text-sm text-gray-500">Пока нет завершённых схваток.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {past.map((m) => {
              const won = m.winnerAthleteId && athleteIds.includes(m.winnerAthleteId);
              return (
                <li key={m.id} className="rounded border p-2 flex justify-between">
                  <span>{oppOf(m)} <span className="text-gray-400">· {m.category.event.name}</span></span>
                  <span className={won ? "text-green-700 font-semibold" : "text-red-600"}>{won ? "победа" : "поражение"}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function schvatok(n: number): string {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "схватку";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "схватки";
  return "схваток";
}
