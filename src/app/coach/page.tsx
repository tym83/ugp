import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { togglePaidAction } from "@/app/coach-actions";
import { signOutAction } from "@/app/auth-actions";
import RegisterGrid from "./RegisterGrid";
import RefLink from "./RefLink";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function CoachPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isCoach = user.memberships.some((m) => m.role === "COACH");
  if (!isCoach) return <main className="p-8">Нужна роль тренера. <Link className="text-blue-600" href="/login">Войти</Link></main>;

  const event = await prisma.event.findFirst({ where: { status: "REG_OPEN" }, orderBy: { date: "asc" } });
  if (!event) return <main className="p-8">Нет открытых событий.</main>;

  // Полный адрес сайта для реф-ссылки (в проде NEXT_PUBLIC_SITE_URL не задан — берём хост запроса).
  const h = await headers();
  const host = h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  const catRows = await prisma.category.findMany({
    where: { eventId: event.id, mergedIntoId: null },
    orderBy: { order: "asc" },
  });
  const categories = catRows.map((c) => ({
    id: c.id,
    label: `${c.ageGroupLabel} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline === "gi" ? "ги" : "ноу-ги"}${
      c.isAbsolute ? " · АБСОЛЮТКА" : c.isOpenTop ? ` · +${c.weightMin ?? 0} кг` : c.weightMax != null ? ` · до ${c.weightMax} кг` : ""
    }`,
    sex: c.sex as "M" | "F",
    discipline: c.discipline as "gi" | "nogi",
    ageGroupCode: c.ageGroupCode,
    birthYearFrom: c.birthYearFrom,
    birthYearTo: c.birthYearTo,
    weightMin: c.weightMin,
    weightMax: c.weightMax,
    isOpenTop: c.isOpenTop,
    isAbsolute: c.isAbsolute,
    level: c.level,
  }));

  const entries = await prisma.eventEntry.findMany({
    where: { eventId: event.id, coachUserId: user.id },
    include: { athlete: true, registrations: { include: { category: true } } },
    orderBy: { createdAt: "desc" },
  });
  const gross = entries.reduce((s, e) => s + e.priceTotal, 0);
  const commission = event.coachCommission * entries.length;
  const net = gross - commission;
  const paidSum = entries.filter((e) => e.paidToCoach).reduce((s, e) => s + e.priceTotal - event.coachCommission, 0);

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Кабинет тренера · {user.fullName}</h1>
        <form action={signOutAction}><button className="text-sm text-gray-500">выйти</button></form>
      </div>
      <p className="text-sm text-gray-500">Событие: {event.name}</p>

      <section className="mt-6">
        <RefLink eventId={event.id} coachId={user.id} origin={origin} />
      </section>

      <section className="mt-6">
        <h2 className="text-lg font-semibold mb-2">Заявить группу</h2>
        <p className="text-xs text-gray-500 mb-2">Вводите спортсменов; в колонке «Категории» появятся подходящие по полу, году рождения и весу — отметьте нужные (можно несколько, включая абсолютку). Цена — по числу категорий, со скидкой тренерского списка.</p>
        <RegisterGrid eventId={event.id} categories={categories} />
      </section>

      <section className="mt-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Мои спортсмены ({entries.length})</h2>
          <div className="text-sm">
            К переводу оргам: <b>{net} ₽</b> <span className="text-gray-400">(взносы {gross} − комиссия {commission})</span>
          </div>
        </div>
        <table className="mt-2 text-sm w-full border">
          <thead className="bg-gray-50"><tr>
            <th className="border px-2 py-1 text-left">ФИО</th><th className="border px-2 py-1">Разделы</th>
            <th className="border px-2 py-1">Категории</th><th className="border px-2 py-1">Взнос</th><th className="border px-2 py-1">Оплатил мне</th>
          </tr></thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id}>
                <td className="border px-2 py-1">{e.athlete.fullName}</td>
                <td className="border px-2 py-1 text-center">{e.disciplines}</td>
                <td className="border px-2 py-1 text-xs">{e.registrations.map((r) => r.category.ageGroupLabel + " " + (r.category.isOpenTop ? "св." + r.category.weightMin : "до" + r.category.weightMax)).join("; ")}</td>
                <td className="border px-2 py-1 text-center">{e.priceTotal} ₽</td>
                <td className="border px-2 py-1 text-center">
                  <form action={togglePaidAction.bind(null, e.id, !e.paidToCoach)}>
                    <button className={e.paidToCoach ? "text-green-600" : "text-gray-300"}>{e.paidToCoach ? "✓ оплатил" : "отметить"}</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-500 mt-1">Собрано (оплатившие мне, за вычетом комиссии): {paidSum} ₽</p>
      </section>
    </main>
  );
}
