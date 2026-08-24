import { getCurrentUser } from "@/lib/auth/session";
import { createEvent, createEventFromPreset } from "@/app/admin-actions";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function NewEventPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowed = user.memberships.some((m) => m.role === "ADMIN" || m.role === "ORGANIZER");
  if (!allowed) return <main className="p-8">Недостаточно прав.</main>;

  return (
    <main className="mx-auto max-w-xl p-6">
      <Link className="text-sm text-blue-600" href="/admin">← к списку</Link>
      <h1 className="text-2xl font-bold mt-2">Новое событие</h1>

      <form action={createEventFromPreset} className="mt-4">
        <button className="text-sm rounded bg-gray-800 text-white px-3 py-1">создать из пресета Танкоград</button>
        <span className="text-xs text-gray-500 ml-2">событие + категории + тиры + ковры</span>
      </form>

      <p className="text-xs text-gray-400 my-4">— или вручную —</p>

      <form action={createEvent} className="space-y-3">
        <input name="name" placeholder="Название" className="w-full border rounded px-3 py-2" required />
        <div className="flex gap-2">
          <input name="city" placeholder="Город" className="w-full border rounded px-3 py-2" required />
          <input name="series" placeholder="Серия (опц.)" className="w-full border rounded px-3 py-2" />
        </div>
        <input name="venue" placeholder="Площадка (опц.)" className="w-full border rounded px-3 py-2" />
        <input name="address" placeholder="Адрес (опц.)" className="w-full border rounded px-3 py-2" />
        <label className="block text-sm text-gray-600">Дата и время события
          <input name="date" type="datetime-local" className="w-full border rounded px-3 py-2" required />
        </label>
        <div className="flex gap-2">
          <label className="block text-sm text-gray-600 w-full">Открытие регистрации
            <input name="registrationOpensAt" type="datetime-local" className="w-full border rounded px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600 w-full">Закрытие регистрации
            <input name="registrationClosesAt" type="datetime-local" className="w-full border rounded px-3 py-2" />
          </label>
        </div>
        <div className="flex gap-2">
          <label className="block text-sm text-gray-600 w-full">Ковров
            <input name="matsCount" type="number" min={1} defaultValue={3} className="w-full border rounded px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600 w-full">Комиссия тренера (₽)
            <input name="coachCommission" type="number" min={0} defaultValue={200} className="w-full border rounded px-3 py-2" />
          </label>
          <label className="block text-sm text-gray-600 w-full">Разделы
            <input name="disciplines" defaultValue="gi,nogi" className="w-full border rounded px-3 py-2" />
          </label>
        </div>
        <button className="rounded bg-blue-600 px-4 py-2 text-white">Создать событие</button>
      </form>
    </main>
  );
}
