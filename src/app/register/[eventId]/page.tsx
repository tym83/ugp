import { prisma } from "@/lib/prisma";
import Link from "next/link";
import type { Metadata } from "next";
import SelfRegisterForm from "@/components/SelfRegisterForm";
import { getCurrentUser } from "@/lib/auth/session";

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
    include: {
      priceTiers: { orderBy: { order: "asc" } },
      categories: { where: { mergedIntoId: null }, orderBy: { order: "asc" } },
    },
  });
  if (!event) return <main className="p-8">Событие не найдено</main>;

  const user = await getCurrentUser();
  const nextPath = encodeURIComponent(`/register/${eventId}`);

  const tiers = event.priceTiers.map((t) => ({
    name: t.name,
    startsAt: t.startsAt.toISOString(),
    priceFirstCategory: t.priceFirstCategory,
    priceExtraCategory: t.priceExtraCategory,
  }));

  const categories = event.categories.map((c) => ({
    id: c.id,
    label: `${c.ageGroupLabel} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline === "gi" ? "ги" : "ноу-ги"}${
      c.isAbsolute ? " · АБСОЛЮТКА" : c.isOpenTop ? ` · +${c.weightMin ?? 0} кг` : c.weightMax != null ? ` · до ${c.weightMax} кг` : ""
    }`,
    sex: c.sex as "M" | "F",
    discipline: c.discipline as "gi" | "nogi",
    ageGroupCode: c.ageGroupCode,
    ageGroupLabel: c.ageGroupLabel,
    birthYearFrom: c.birthYearFrom,
    birthYearTo: c.birthYearTo,
    weightMin: c.weightMin,
    weightMax: c.weightMax,
    isOpenTop: c.isOpenTop,
    isAbsolute: c.isAbsolute,
    level: c.level,
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
      ) : !user ? (
        <div className="rounded border border-blue-200 bg-blue-50 p-4 text-sm">
          <p className="text-blue-900 font-semibold">Чтобы подать заявку, войдите в аккаунт</p>
          <p className="text-blue-800 mt-1">Регистрация участника доступна только авторизованным — так вы сможете видеть свои заявки и сетки.</p>
          <div className="mt-3 flex gap-3">
            <Link href={`/login?next=${nextPath}`} className="rounded bg-blue-600 px-4 py-2 text-white">Войти</Link>
            <Link href={`/signup?next=${nextPath}`} className="rounded border border-blue-300 px-4 py-2 text-blue-700">Создать аккаунт</Link>
          </div>
        </div>
      ) : (
        <SelfRegisterForm eventId={eventId} tiers={tiers} categories={categories} />
      )}

      <footer className="mt-10 border-t pt-4 text-xs text-gray-500">
        <Link href="/privacy" className="text-blue-600">Политика обработки ПДн</Link>
      </footer>
    </main>
  );
}
