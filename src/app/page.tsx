import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Countdown from "@/components/Countdown";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "черновик", cls: "bg-gray-200 text-gray-700" },
  REG_OPEN: { text: "регистрация открыта", cls: "bg-green-500 text-white" },
  REG_CLOSED: { text: "регистрация закрыта", cls: "bg-amber-500 text-white" },
  LIVE: { text: "идёт сейчас", cls: "bg-red-600 text-white" },
  COMPLETED: { text: "завершён", cls: "bg-gray-300 text-gray-700" },
};

export default async function Home() {
  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { _count: { select: { entries: true, categories: true } } },
  });
  const featured = events.find((e) => e.status === "REG_OPEN") ?? events.find((e) => e.status === "LIVE") ?? events[0];
  const others = events.filter((e) => e.id !== featured?.id);
  const st = featured ? STATUS[featured.status] ?? { text: featured.status, cls: "bg-gray-200 text-gray-700" } : null;

  return (
    <main>
      {/* Хиро с главным событием */}
      <section className="bg-gray-900 text-white">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="text-sm font-semibold uppercase tracking-widest text-blue-400">Underground Grappling</div>
          {featured ? (
            <>
              <h1 className="mt-3 text-4xl font-bold sm:text-5xl">{featured.name}</h1>
              <p className="mt-4 text-lg text-gray-300">
                {new Date(featured.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
                {" · "}{featured.city}{featured.venue ? ` · ${featured.venue}` : ""}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                {st && <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.text}</span>}
                <span>{featured._count.categories} категорий</span>
                <span>{featured._count.entries} заявок</span>
              </div>
              {featured.status === "REG_OPEN" && featured.registrationClosesAt && (
                <div className="mt-4 text-gray-300"><Countdown target={new Date(featured.registrationClosesAt).toISOString()} /></div>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                {featured.status === "REG_OPEN" && (
                  <Link href={`/register/${featured.id}`} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold hover:bg-blue-500">
                    Зарегистрироваться
                  </Link>
                )}
                <Link href={`/event/${featured.id}#divisions`} className="rounded-lg bg-white px-6 py-3 font-semibold text-gray-900 hover:bg-gray-100">
                  Сетки и категории
                </Link>
                <Link href={`/event/${featured.id}`} className="rounded-lg border border-gray-600 px-6 py-3 hover:bg-white/10">
                  О турнире
                </Link>
              </div>
            </>
          ) : (
            <h1 className="mt-3 text-4xl font-bold">Платформа турниров по грэпплингу и BJJ</h1>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Прочие события */}
        {others.length > 0 && (
          <section className="mb-10">
            <h2 className="mb-4 text-xl font-semibold">Другие события</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {others.map((e) => {
                const badge = STATUS[e.status] ?? { text: e.status, cls: "bg-gray-200 text-gray-700" };
                return (
                  <li key={e.id}>
                    <Link href={`/event/${e.id}`} className="block rounded-lg border p-4 hover:border-gray-900 hover:shadow-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{e.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div className="mt-1 text-sm text-gray-500">
                        {new Date(e.date).toLocaleDateString("ru-RU")} · {e.city}
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Аудитории */}
        <section className="grid gap-4 sm:grid-cols-3">
          <Link href={featured ? `/register/${featured.id}` : "/login"} className="rounded-lg border bg-white p-5 hover:shadow">
            <div className="font-semibold">Спортсменам</div>
            <p className="mt-1 text-sm text-gray-500">Заявка за пару минут, автоподбор категории, взнос онлайн-калькулятором.</p>
          </Link>
          <Link href="/coaches" className="rounded-lg border bg-white p-5 hover:shadow">
            <div className="font-semibold">Тренерам</div>
            <p className="mt-1 text-sm text-gray-500">Заявка группой, 200 ₽ с регистрации, командные призы 30/20/10 тыс. ₽.</p>
          </Link>
          <Link href="/sponsors" className="rounded-lg border bg-white p-5 hover:shadow">
            <div className="font-semibold">Спонсорам</div>
            <p className="mt-1 text-sm text-gray-500">Пакеты по запросу. Аудитория грэпплинг-комьюнити региона.</p>
          </Link>
        </section>
      </div>
    </main>
  );
}
