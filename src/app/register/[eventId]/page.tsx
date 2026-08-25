import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import SelfRegisterForm from "@/components/SelfRegisterForm";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ eventId: string }> }): Promise<Metadata> {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return { title: "Регистрация" };
  return {
    title: `Регистрация — ${event.name}`,
    description: `Онлайн-заявка участника на турнир «${event.name}» · ${event.city} · ${new Date(event.date).toLocaleDateString("ru-RU")}.`,
  };
}

export default async function RegisterPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: { priceTiers: { orderBy: { order: "asc" } } },
  });
  if (!event) return <main className="p-8">Событие не найдено</main>;

  const tiers = event.priceTiers.map((t) => ({
    name: t.name,
    startsAt: t.startsAt.toISOString(),
    priceOneDivision: t.priceOneDivision,
    priceBothDivisions: t.priceBothDivisions,
    absoluteSurcharge: t.absoluteSurcharge,
  }));

  return (
    <main className="mx-auto max-w-lg p-8">
      <Link href={`/event/${eventId}`} className="text-sm text-blue-600">← {event.name}</Link>
      <h1 className="text-2xl font-bold mt-2">Регистрация участника</h1>
      <p className="text-sm text-gray-500 mb-4">
        {new Date(event.date).toLocaleDateString("ru-RU")} · {event.city} · {event.venue}
      </p>

      {event.status !== "REG_OPEN" ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Регистрация на это событие сейчас закрыта (статус: {event.status}).
        </div>
      ) : (
        <SelfRegisterForm eventId={eventId} tiers={tiers} />
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-gray-500">
        <Link href="/privacy" className="text-blue-600">Политика обработки ПДн</Link>
      </footer>
    </main>
  );
}
