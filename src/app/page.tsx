import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Countdown from "@/components/Countdown";

export const dynamic = "force-dynamic";

const statusBadge: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "черновик", cls: "bg-gray-100 text-gray-600" },
  REG_OPEN: { text: "регистрация открыта", cls: "bg-green-100 text-green-700" },
  REG_CLOSED: { text: "регистрация закрыта", cls: "bg-amber-100 text-amber-700" },
  LIVE: { text: "идёт", cls: "bg-red-100 text-red-700" },
  DONE: { text: "завершён", cls: "bg-gray-100 text-gray-500" },
};

export default async function Home() {
  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  const openEvent = events.find((e) => e.status === "REG_OPEN") ?? events[0];

  return (
    <main>
      {/* Hero */}
      <section className="border-b bg-gray-900 text-white">
        <div className="mx-auto max-w-4xl px-8 py-16">
          <h1 className="text-4xl font-bold">Underground Grappling Platform</h1>
          <p className="mt-3 max-w-xl text-lg text-gray-300">
            Турниры по грэпплингу и BJJ: онлайн-заявки, сетки, живой прогресс схваток и командный зачёт.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            {openEvent && openEvent.status === "REG_OPEN" && (
              <Link href={`/register/${openEvent.id}`} className="rounded bg-blue-600 px-5 py-2.5 font-semibold">
                Зарегистрироваться
              </Link>
            )}
            <Link href="/coach" className="rounded border border-gray-500 px-5 py-2.5">Кабинет тренера</Link>
            <Link href="/me/search" className="rounded border border-gray-500 px-5 py-2.5">Найти свою сетку</Link>
          </div>
          {openEvent?.registrationClosesAt && openEvent.status === "REG_OPEN" && (
            <div className="mt-4 text-gray-300">
              <Countdown target={new Date(openEvent.registrationClosesAt).toISOString()} />
            </div>
          )}
        </div>
      </section>

      {/* События */}
      <section className="mx-auto max-w-4xl px-8 py-10">
        <h2 className="text-xl font-semibold mb-4">События</h2>
        <ul className="space-y-3">
          {events.map((e) => {
            const badge = statusBadge[e.status] ?? { text: e.status, cls: "bg-gray-100 text-gray-600" };
            return (
              <li key={e.id} className="rounded-lg border p-4 hover:bg-gray-50">
                <Link href={`/event/${e.id}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{e.name}</span>
                    <span className={`rounded px-2 py-0.5 text-xs ${badge.cls}`}>{badge.text}</span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {new Date(e.date).toLocaleDateString("ru-RU")} · {e.city}{e.venue ? ` · ${e.venue}` : ""}
                    {" · "}заявок: {e._count.entries}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Ссылки для аудиторий */}
      <section className="border-t bg-gray-50">
        <div className="mx-auto max-w-4xl px-8 py-10 grid gap-4 sm:grid-cols-2">
          <Link href="/coaches" className="rounded-lg border bg-white p-5 hover:shadow">
            <div className="font-semibold">Тренерам</div>
            <p className="mt-1 text-sm text-gray-500">200 ₽ с регистрации + командные призы 30/20/10 тыс. ₽.</p>
          </Link>
          <Link href="/sponsors" className="rounded-lg border bg-white p-5 hover:shadow">
            <div className="font-semibold">Спонсорам</div>
            <p className="mt-1 text-sm text-gray-500">Пакеты по запросу. Аудитория грэпплинг-комьюнити.</p>
          </Link>
        </div>
      </section>
    </main>
  );
}
