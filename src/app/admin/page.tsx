import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { signOutAction } from "@/app/auth-actions";
import { createEventFromPreset } from "@/app/admin-actions";
import { EVENT_STATUS_LABELS, type EventStatus } from "@/lib/data/preset";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function statusLabel(s: string): string {
  return EVENT_STATUS_LABELS[s as EventStatus] ?? s;
}

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowed = user.memberships.some((m) => m.role === "ADMIN" || m.role === "ORGANIZER");
  if (!allowed) return <main className="p-8">Нужна роль администратора или организатора. <Link className="text-blue-600" href="/login">Войти</Link></main>;

  const events = await prisma.event.findMany({
    orderBy: { date: "desc" },
    include: { _count: { select: { categories: true, priceTiers: true } } },
  });

  return (
    <main className="mx-auto max-w-4xl p-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Администрирование · {user.fullName}</h1>
        <form action={signOutAction}><button className="text-sm text-gray-500">выйти</button></form>
      </div>
      <nav className="mt-2 text-sm space-x-4">
        <Link className="text-blue-600" href="/admin/events/new">+ Новое событие</Link>
        <Link className="text-blue-600" href="/admin/users">Пользователи и роли</Link>
      </nav>

      <section className="mt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">События ({events.length})</h2>
          <form action={createEventFromPreset}>
            <button className="text-sm rounded bg-gray-800 text-white px-3 py-1">создать из пресета Танкоград</button>
          </form>
        </div>
        <table className="mt-2 text-sm w-full border">
          <thead className="bg-gray-50"><tr>
            <th className="border px-2 py-1 text-left">Название</th>
            <th className="border px-2 py-1">Город</th>
            <th className="border px-2 py-1">Дата</th>
            <th className="border px-2 py-1">Статус</th>
            <th className="border px-2 py-1">Кат.</th>
            <th className="border px-2 py-1">Тиры</th>
            <th className="border px-2 py-1"></th>
          </tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="border px-2 py-1">{e.name}</td>
                <td className="border px-2 py-1 text-center">{e.city}</td>
                <td className="border px-2 py-1 text-center">{e.date.toISOString().slice(0, 10)}</td>
                <td className="border px-2 py-1 text-center">{statusLabel(e.status)}</td>
                <td className="border px-2 py-1 text-center">{e._count.categories}</td>
                <td className="border px-2 py-1 text-center">{e._count.priceTiers}</td>
                <td className="border px-2 py-1 text-center"><Link className="text-blue-600" href={`/admin/events/${e.id}`}>править</Link></td>
              </tr>
            ))}
            {events.length === 0 && <tr><td className="border px-2 py-2 text-gray-400 text-center" colSpan={7}>событий нет</td></tr>}
          </tbody>
        </table>
      </section>
    </main>
  );
}
