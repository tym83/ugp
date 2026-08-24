import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import EventSearch from "@/components/EventSearch";

export const dynamic = "force-dynamic";

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
    where: { eventId: id },
    include: { _count: { select: { registrations: true } } },
    orderBy: { order: "asc" },
  });
  const withReg = cats.filter((c) => c._count.registrations > 0);

  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="text-sm text-blue-600">← события</Link>
      <h1 className="text-3xl font-bold mt-2">{event.name}</h1>
      <p className="text-gray-600">
        {new Date(event.date).toLocaleDateString("ru-RU")} · {event.city} · {event.venue}, {event.address} · {event.matsCount} ковра
      </p>
      <div className="mt-2 inline-block rounded bg-gray-100 px-2 py-1 text-xs">Статус: {event.status}</div>

      <div className="mt-4 flex flex-wrap gap-2">
        {event.status === "REG_OPEN" && (
          <Link href={`/register/${event.id}`} className="rounded bg-blue-600 px-4 py-2 text-sm text-white">Зарегистрироваться</Link>
        )}
        <Link href={`/standings/${event.id}`} className="rounded border px-4 py-2 text-sm">Командный зачёт</Link>
        <Link href="/me/search" className="rounded border px-4 py-2 text-sm">Найти свою сетку</Link>
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Поиск участника / клуба</h2>
        <EventSearch eventId={event.id} />
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Программа дня</h2>
        <ul className="text-sm space-y-1">
          {timings.map((x, i) => (
            <li key={i}><span className="font-mono text-gray-500">{x.t}</span> — {x.what}</li>
          ))}
        </ul>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Стоимость</h2>
        <table className="text-sm border">
          <thead><tr className="bg-gray-50"><th className="border px-3 py-1 text-left">Тир</th><th className="border px-3 py-1">1 раздел</th><th className="border px-3 py-1">Оба раздела</th></tr></thead>
          <tbody>
            {event.priceTiers.map((t) => (
              <tr key={t.id}>
                <td className="border px-3 py-1">{t.name} (с {new Date(t.startsAt).toLocaleDateString("ru-RU")})</td>
                <td className="border px-3 py-1 text-center">{t.priceOneDivision} ₽</td>
                <td className="border px-3 py-1 text-center">{t.priceBothDivisions} ₽</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-1">Комиссия клубу: {event.coachCommission} ₽ с регистрации.</p>
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Категории: {cats.length}</h2>
        <p className="text-sm text-gray-500 mb-2">С заявками ({withReg.length}) — можно смотреть сетки:</p>
        <ul className="space-y-2">
          {withReg.map((c) => (
            <li key={c.id} className="rounded border p-3 hover:bg-gray-50">
              <Link href={`/category/${c.id}`}>
                {c.ageGroupLabel} · {c.sex === "M" ? "муж" : "жен"} · {c.discipline} ·{" "}
                {c.isAbsolute ? "абсолютка" : c.isOpenTop ? `свыше ${c.weightMin}` : `до ${c.weightMax}`} кг
                <span className="ml-2 text-xs text-gray-500">заявок: {c._count.registrations}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
