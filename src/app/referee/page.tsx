import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RefereePage() {
  const user = await requirePageRole("REFEREE", "MAT_COORDINATOR", "ORGANIZER", "ADMIN");
  const refMs = user.memberships.filter((m) => m.role === "REFEREE" || m.role === "MAT_COORDINATOR");
  const eventIds = [...new Set(refMs.map((m) => m.eventId).filter(Boolean) as string[])];
  const mats = [...new Set(refMs.map((m) => m.matNumber).filter((x): x is number => x != null))];
  const isStaff = user.memberships.some((m) => m.role === "ORGANIZER" || m.role === "ADMIN");

  // готовые к вводу матчи в событиях судьи (или во всех — для орг/админ без привязки)
  const where = eventIds.length ? { category: { eventId: { in: eventIds } } } : isStaff ? {} : { id: "none" };
  const ready = await prisma.match.findMany({
    where: { ...where, status: { not: "COMPLETED" }, slotAAthleteId: { not: null }, slotBAthleteId: { not: null } },
    include: { category: { include: { event: true } } },
    orderBy: [{ matNumber: "asc" }, { roundNumber: "asc" }],
  });

  // группируем по категории
  const byCat = new Map<string, { label: string; event: string; count: number }>();
  for (const m of ready) {
    const c = m.category;
    const w = c.isAbsolute ? "абсолютка" : c.isOpenTop ? `+${c.weightMin}` : `до ${c.weightMax} кг`;
    const label = `${c.ageGroupLabel} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline} · ${w}`;
    const cur = byCat.get(c.id) ?? { label, event: c.event.name, count: 0 };
    cur.count++;
    byCat.set(c.id, cur);
  }
  const cats = [...byCat.entries()];

  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      <div className="mx-auto max-w-3xl px-6 py-8">
        <div className="text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Судейство</div>
        <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">Судейский пульт</h1>
        <p className="text-sm text-[#cec8bc]">Вы вошли как {user.fullName} · судья</p>

        {mats.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-3">
            {mats.map((n) => (
              <div key={n} className="rounded-lg border border-[#e3863d]/40 bg-white/5 px-6 py-4 text-center">
                <div className="text-xs uppercase tracking-widest text-[#cec8bc]">Ваш ковёр</div>
                <div className="text-4xl font-black text-[#e3863d]">№{n}</div>
              </div>
            ))}
          </div>
        )}

        <h2 className="mt-8 mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Готовы к вводу</h2>
        {cats.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-white/5 p-6 text-[#cec8bc]">
            Сейчас нет матчей, готовых к вводу. Либо сетки ещё не сгенерированы, либо ждём предыдущих схваток.
            {refMs.length === 0 && !isStaff && <div className="mt-2">Вам пока не назначен ковёр — обратитесь к организатору.</div>}
          </div>
        ) : (
          <ul className="space-y-2">
            {cats.map(([id, c]) => (
              <li key={id}>
                <Link href={`/judge/${id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 hover:border-[#e3863d]/60">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{c.label}</div>
                    <div className="text-xs text-[#8a8378]">{c.event}</div>
                  </div>
                  <span className="ml-2 shrink-0 rounded-full bg-[#e3863d]/20 px-3 py-1 text-sm font-semibold text-[#e3863d]">{c.count} к вводу</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
