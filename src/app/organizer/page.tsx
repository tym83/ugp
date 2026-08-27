import { prisma } from "@/lib/prisma";
import { requirePageRole, hasRole } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  DRAFT: "черновик", REG_OPEN: "регистрация открыта", REG_CLOSED: "регистрация закрыта",
  LIVE: "идёт", COMPLETED: "завершён", ARCHIVED: "архив",
};

export default async function OrganizerIndex() {
  const user = await requirePageRole("ORGANIZER", "ADMIN");
  const isAdmin = hasRole(user, "ADMIN");
  const platform = user.memberships.some((m) => m.role === "ORGANIZER" && m.scope === "PLATFORM");
  const ownEventIds = user.memberships
    .filter((m) => m.role === "ORGANIZER" && m.eventId)
    .map((m) => m.eventId as string);

  const events =
    isAdmin || platform
      ? await prisma.event.findMany({ orderBy: { date: "asc" } })
      : await prisma.event.findMany({ where: { id: { in: ownEventIds } }, orderBy: { date: "asc" } });

  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Организатор</div>
            <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">Мои события</h1>
          </div>
          <Link href="/admin/events/new" className="rounded bg-[#e3863d] px-4 py-2 text-sm font-bold uppercase tracking-wide text-black hover:brightness-110">+ Событие</Link>
        </div>

        {events.length === 0 ? (
          <div className="mt-6 rounded-lg border border-white/10 bg-white/5 p-6 text-[#cec8bc]">Событий пока нет. Создайте новое.</div>
        ) : (
          <ul className="mt-6 space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link href={`/organizer/${e.id}`} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4 hover:border-[#e3863d]/60">
                  <div>
                    <div className="font-bold uppercase">{e.name}</div>
                    <div className="text-sm text-[#8a8378]">{new Date(e.date).toLocaleDateString("ru-RU")} · {e.city}</div>
                  </div>
                  <span className="ml-2 rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-wide text-[#cec8bc]">{STATUS[e.status] ?? e.status}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
