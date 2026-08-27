import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import EventSearch from "@/components/EventSearch";
import DivisionsBrowser, { type Division } from "@/components/DivisionsBrowser";
import Countdown from "@/components/Countdown";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "черновик", cls: "bg-gray-200 text-gray-700" },
  REG_OPEN: { text: "регистрация открыта", cls: "bg-green-500 text-white" },
  REG_CLOSED: { text: "регистрация закрыта", cls: "bg-amber-500 text-white" },
  LIVE: { text: "идёт сейчас", cls: "bg-red-600 text-white" },
  COMPLETED: { text: "завершён", cls: "bg-gray-300 text-gray-700" },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id } });
  if (!event) return { title: "Событие не найдено" };
  const dateStr = new Date(event.date).toLocaleDateString("ru-RU");
  const title = `${event.name} — ${event.city}, ${dateStr}`;
  const description = `Турнир по грэпплингу «${event.name}» · ${event.city}${event.venue ? `, ${event.venue}` : ""} · ${dateStr}. Онлайн-регистрация, категории, сетки и результаты.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", locale: "ru_RU" },
    twitter: { card: "summary", title, description },
  };
}

export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const event = await prisma.event.findUnique({ where: { id }, include: { priceTiers: { orderBy: { order: "asc" } } } });
  if (!event) return <main className="p-8">Событие не найдено</main>;
  const timings: { t: string; what: string }[] = event.timings ? JSON.parse(event.timings) : [];
  const cats = await prisma.category.findMany({
    where: { eventId: id, mergedIntoId: null },
    include: { _count: { select: { registrations: true, matches: true } } },
    orderBy: { order: "asc" },
  });
  const divisions: Division[] = cats.map((c) => ({
    id: c.id, ageGroupLabel: c.ageGroupLabel, ageGroupCode: c.ageGroupCode, order: c.order,
    sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    weightMin: c.weightMin, weightMax: c.weightMax, isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute,
    count: c._count.registrations, hasBracket: c._count.matches > 0,
  }));
  const st = STATUS[event.status] ?? { text: event.status, cls: "bg-gray-200 text-gray-700" };

  return (
    <main className="bg-[#0d0b08] text-[#f4f0e8]">
      {/* Hero события */}
      <section className="border-b border-white/10 bg-cover bg-center" style={{ backgroundImage: "linear-gradient(to top, #0d0b08, rgba(13,11,8,0.7)), url(/brand/concrete-dark.jpg)" }}>
        <div className="mx-auto max-w-5xl px-6 py-12">
          <Link href="/" className="text-sm text-[#8a8378] hover:text-[#e3863d]">← все события</Link>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold sm:text-4xl">{event.name}</h1>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${st.cls}`}>{st.text}</span>
          </div>
          <p className="mt-3 text-lg text-[#dcd7ce]">
            {new Date(event.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}{event.city}{event.venue ? ` · ${event.venue}` : ""}{event.address ? `, ${event.address}` : ""}
            {" · "}{event.matsCount} ковра
          </p>
          {event.status === "REG_OPEN" && event.registrationClosesAt && (
            <div className="mt-3 text-[#dcd7ce]"><Countdown target={new Date(event.registrationClosesAt).toISOString()} /></div>
          )}
          <div className="mt-6 flex flex-wrap gap-3">
            {event.status === "REG_OPEN" && (
              <Link href={`/register/${event.id}`} className="rounded bg-[#e3863d] px-6 py-2.5 font-bold uppercase tracking-wide text-black hover:brightness-110">
                Зарегистрироваться
              </Link>
            )}
            <a href="#divisions" className="rounded border border-white/25 px-6 py-2.5 font-semibold hover:bg-white/10">Сетки и категории</a>
            <Link href={`/standings/${event.id}`} className="rounded border border-white/25 px-6 py-2.5 font-semibold hover:bg-white/10">Командный зачёт</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-6 py-10">
        {/* Сетки и категории — главный блок */}
        <section id="divisions" className="scroll-mt-4">
          <h2 className="mb-1 text-2xl font-black uppercase tracking-tight">Сетки и категории</h2>
          <p className="mb-4 text-sm text-[#cec8bc]">
            Выбери категорию, чтобы открыть полную сетку. Фильтруй по разделу, полу и весу. Поиск по имени — ниже.
          </p>
          <DivisionsBrowser divisions={divisions} />
        </section>

        {/* Поиск участника/клуба — вторично */}
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Найти спортсмена или клуб</h2>
          <EventSearch eventId={event.id} />
        </section>

        <div className="mt-10 grid gap-8 sm:grid-cols-2">
          {/* Программа */}
          {timings.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Программа дня</h2>
              <ul className="space-y-1 text-sm">
                {timings.map((x, i) => (
                  <li key={i}><span className="font-mono text-[#e3863d]">{x.t}</span> — {x.what}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Стоимость */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]">Стоимость</h2>
            <table className="w-full border border-white/10 text-sm">
              <thead>
                <tr className="bg-white/5 text-[#cec8bc]">
                  <th className="border border-white/10 px-3 py-1 text-left">Тир</th>
                  <th className="border border-white/10 px-3 py-1">1 раздел</th>
                  <th className="border border-white/10 px-3 py-1">Оба</th>
                </tr>
              </thead>
              <tbody>
                {event.priceTiers.map((t) => (
                  <tr key={t.id}>
                    <td className="border border-white/10 px-3 py-1">{t.name} <span className="text-[#8a8378]">с {new Date(t.startsAt).toLocaleDateString("ru-RU")}</span></td>
                    <td className="border border-white/10 px-3 py-1 text-center">{t.priceOneDivision} ₽</td>
                    <td className="border border-white/10 px-3 py-1 text-center">{t.priceBothDivisions} ₽</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-[#8a8378]">Комиссия клубу: {event.coachCommission} ₽ с регистрации.</p>
          </section>
        </div>

        <footer className="mt-10 border-t border-white/10 pt-4 text-xs text-[#8a8378]">
          <Link href="/privacy" className="hover:text-[#e3863d]">Политика обработки ПДн</Link>
        </footer>
      </div>
    </main>
  );
}
