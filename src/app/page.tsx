import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Countdown from "@/components/Countdown";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "черновик", cls: "bg-white/15 text-white" },
  REG_OPEN: { text: "регистрация открыта", cls: "bg-[#e3863d] text-black" },
  REG_CLOSED: { text: "регистрация закрыта", cls: "bg-amber-700 text-white" },
  LIVE: { text: "идёт сейчас", cls: "bg-red-600 text-white" },
  COMPLETED: { text: "завершён", cls: "bg-white/15 text-white" },
};

const GALLERY = ["01", "02", "04", "06", "07", "09", "10", "05"];

export default async function Home() {
  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { _count: { select: { entries: true, categories: true } } },
  });
  const featured = events.find((e) => e.status === "REG_OPEN") ?? events.find((e) => e.status === "LIVE") ?? events[0];
  const others = events.filter((e) => e.id !== featured?.id);
  const st = featured ? STATUS[featured.status] ?? { text: featured.status, cls: "bg-white/15 text-white" } : null;

  return (
    <main className="bg-[#0d0b08] text-[#f4f0e8]">
      {/* Хиро с брендовым постером */}
      <section className="relative min-h-[88vh] w-full">
        <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url(/brand/hero-cover.jpg)" }} />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0d0b08] via-[#0d0b08]/60 to-[#0d0b08]/30" />
        <div className="relative mx-auto flex min-h-[88vh] max-w-5xl flex-col justify-end px-6 pb-14 pt-24">
          <div className="text-sm font-bold uppercase tracking-[0.3em] text-[#e3863d]">Underground Grappling · Челябинск</div>
          {featured ? (
            <>
              <h1 className="mt-3 text-4xl font-black uppercase leading-none tracking-tight sm:text-6xl">{featured.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-lg text-[#dcd7ce]">
                {st && <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${st.cls}`}>{st.text}</span>}
                <span>{new Date(featured.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
                {featured.venue && <span>· {featured.venue}</span>}
                <span>· {featured.city}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 text-sm text-[#cec8bc]">
                <span>{featured._count.categories} категорий</span>
                <span>{featured._count.entries} заявок</span>
                <span>{featured.matsCount} ковра</span>
              </div>
              {featured.status === "REG_OPEN" && featured.registrationClosesAt && (
                <div className="mt-4 text-[#dcd7ce]"><Countdown target={new Date(featured.registrationClosesAt).toISOString()} /></div>
              )}
              <div className="mt-7 flex flex-wrap gap-3">
                {featured.status === "REG_OPEN" && (
                  <Link href={`/register/${featured.id}`} className="rounded bg-[#e3863d] px-7 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110">
                    Зарегистрироваться
                  </Link>
                )}
                <Link href={`/event/${featured.id}#divisions`} className="rounded border border-white/30 bg-white/5 px-7 py-3 font-bold uppercase tracking-wide backdrop-blur hover:bg-white/15">
                  Сетки и категории
                </Link>
                <Link href={`/event/${featured.id}`} className="rounded px-7 py-3 font-semibold text-[#dcd7ce] underline-offset-4 hover:underline">
                  О турнире →
                </Link>
              </div>
            </>
          ) : (
            <h1 className="mt-3 text-5xl font-black uppercase">Турниры по грэпплингу</h1>
          )}
        </div>
      </section>

      {/* Галерея прошлых событий */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-12">
          <h2 className="mb-5 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">С прошлых турниров</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GALLERY.map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n} src={`/gallery/gallery-${n}.jpg`} alt="Underground Grappling" loading="lazy"
                className="aspect-[4/3] w-full rounded object-cover grayscale transition hover:grayscale-0" />
            ))}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl px-6 pb-16">
        {others.length > 0 && (
          <section className="mb-12">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Другие события</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {others.map((e) => {
                const badge = STATUS[e.status] ?? { text: e.status, cls: "bg-white/15 text-white" };
                return (
                  <li key={e.id}>
                    <Link href={`/event/${e.id}`} className="block rounded border border-white/10 bg-white/5 p-4 hover:border-[#e3863d]/60">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold uppercase">{e.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs ${badge.cls}`}>{badge.text}</span>
                      </div>
                      <div className="mt-1 text-sm text-[#cec8bc]">{new Date(e.date).toLocaleDateString("ru-RU")} · {e.city}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-3">
          {[
            { href: featured ? `/register/${featured.id}` : "/login", t: "Спортсменам", d: "Заявка за пару минут, автоподбор категории, взнос онлайн-калькулятором." },
            { href: "/coaches", t: "Тренерам", d: "Заявка группой, 200 ₽ с регистрации, командные призы 30/20/10 тыс. ₽." },
            { href: "/sponsors", t: "Спонсорам", d: "Пакеты по запросу. Аудитория грэпплинг-комьюнити региона." },
          ].map((c) => (
            <Link key={c.t} href={c.href} className="rounded border border-white/10 bg-white/5 p-5 hover:border-[#e3863d]/60">
              <div className="font-bold uppercase tracking-wide">{c.t}</div>
              <p className="mt-1 text-sm text-[#cec8bc]">{c.d}</p>
            </Link>
          ))}
        </section>

        <footer className="mt-12 border-t border-white/10 pt-6 text-xs text-[#8a8378]">
          <Link href="/privacy" className="hover:text-[#e3863d]">Политика обработки ПДн</Link>
          <span className="mx-2">·</span>
          Underground Grappling · Челябинск
        </footer>
      </div>
    </main>
  );
}
