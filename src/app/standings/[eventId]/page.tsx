import { prisma } from "@/lib/prisma";
import { placementsFromCategory } from "@/lib/domain/placement";
import { computeTeamScores, type Placement } from "@/lib/domain/teamscore";
import Link from "next/link";

export const dynamic = "force-dynamic";

const PRIZE = [30000, 20000, 10000];

export default async function StandingsPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return <main className="p-8">Событие не найдено</main>;

  const categories = await prisma.category.findMany({
    where: { eventId, mergedIntoId: null },
    include: {
      matches: true,
      registrations: { include: { athlete: { include: { club: true } } } },
    },
  });

  const placements: Placement[] = [];
  for (const cat of categories) {
    const clubByAthlete = new Map<string, { clubId: string; clubName: string }>();
    for (const r of cat.registrations) {
      if (r.athlete.club) clubByAthlete.set(r.athleteId, { clubId: r.athlete.club.id, clubName: r.athlete.club.name });
    }
    const pl = placementsFromCategory(
      { isAbsolute: cat.isAbsolute, bracketType: cat.bracketType },
      cat.matches,
      (id) => clubByAthlete.get(id) ?? null
    );
    placements.push(...pl);
  }

  const scores = computeTeamScores(placements);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href={`/event/${eventId}`} className="text-sm text-blue-600">← {event.name}</Link>
      <h1 className="text-2xl font-bold mt-2">Командный зачёт</h1>
      <p className="text-sm text-gray-500">Призовой фонд топ-3 клубов: 30 000 / 20 000 / 10 000 ₽</p>

      {scores.length === 0 ? (
        <p className="mt-6 text-gray-500">Пока нет завершённых категорий.</p>
      ) : (
        <table className="mt-4 w-full border text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="border px-2 py-1">Место</th>
              <th className="border px-2 py-1 text-left">Клуб</th>
              <th className="border px-2 py-1">Очки</th>
              <th className="border px-2 py-1">Приз</th>
            </tr>
          </thead>
          <tbody>
            {scores.map((s) => (
              <tr key={s.clubId} className={s.place <= 3 ? "font-medium" : ""}>
                <td className="border px-2 py-1 text-center">{s.place}</td>
                <td className="border px-2 py-1">{s.clubName}</td>
                <td className="border px-2 py-1 text-center">{s.points}</td>
                <td className="border px-2 py-1 text-center text-amber-600">
                  {s.place >= 1 && s.place <= 3 ? `${PRIZE[s.place - 1].toLocaleString("ru-RU")} ₽` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
