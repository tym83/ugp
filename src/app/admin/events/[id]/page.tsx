import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import {
  updateEvent,
  addPriceTier,
  addCategory,
  setEventStatusForm,
  assignRefereeToMatForm,
} from "@/app/admin-actions";
import { EVENT_STATUS_LABELS, nextStatuses, type EventStatus } from "@/lib/data/preset";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

function dtLocal(d: Date | null): string {
  if (!d) return "";
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function statusLabel(s: string): string {
  return EVENT_STATUS_LABELS[s as EventStatus] ?? s;
}

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const allowed = user.memberships.some((m) => m.role === "ADMIN" || m.role === "ORGANIZER");
  if (!allowed) return <main className="p-8">Недостаточно прав.</main>;

  const event = await prisma.event.findUnique({
    where: { id },
    include: {
      priceTiers: { orderBy: { order: "asc" } },
      categories: { orderBy: { order: "asc" } },
      mats: { orderBy: { number: "asc" } },
    },
  });
  if (!event) notFound();

  // судьи (пользователи с любой REFEREE-мембершипой) + их назначение на это событие
  const refMemberships = await prisma.membership.findMany({
    where: { role: "REFEREE" },
    include: { user: true },
  });
  const refUsers = [...new Map(refMemberships.map((m) => [m.userId, m.user])).values()];
  const assignedMat = new Map<string, number | null>();
  for (const m of refMemberships) {
    if (m.eventId === event.id && m.matNumber != null) assignedMat.set(m.userId, m.matNumber);
  }
  const matNumbers = Array.from({ length: event.matsCount }, (_, i) => i + 1);
  const transitions = nextStatuses(event.status);

  return (
    <main className="mx-auto max-w-3xl p-6 space-y-8">
      <div>
        <Link className="text-sm text-blue-600" href="/admin">← к списку</Link>
        <h1 className="text-2xl font-bold mt-2">{event.name}</h1>
        <p className="text-sm text-gray-500">Статус: <b>{statusLabel(event.status)}</b></p>
      </div>

      {/* Статус */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Смена статуса</h2>
        {transitions.length === 0 ? (
          <p className="text-sm text-gray-400">переходов нет (терминальный статус)</p>
        ) : (
          <form action={setEventStatusForm.bind(null, event.id)} className="flex gap-2 items-center">
            <select name="status" className="border rounded px-3 py-2 text-sm">
              {transitions.map((s) => (
                <option key={s} value={s}>{statusLabel(s)} ({s})</option>
              ))}
            </select>
            <button className="rounded bg-blue-600 px-4 py-2 text-white text-sm">Применить</button>
          </form>
        )}
      </section>

      {/* Основные поля */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Параметры события</h2>
        <form action={updateEvent.bind(null, event.id)} className="space-y-3">
          <div className="flex gap-2">
            <input name="name" defaultValue={event.name} placeholder="Название" className="w-full border rounded px-3 py-2" />
            <input name="city" defaultValue={event.city} placeholder="Город" className="w-full border rounded px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <input name="venue" defaultValue={event.venue ?? ""} placeholder="Площадка" className="w-full border rounded px-3 py-2" />
            <input name="address" defaultValue={event.address ?? ""} placeholder="Адрес" className="w-full border rounded px-3 py-2" />
          </div>
          <label className="block text-sm text-gray-600">Дата и время
            <input name="date" type="datetime-local" defaultValue={dtLocal(event.date)} className="w-full border rounded px-3 py-2" />
          </label>
          <div className="flex gap-2">
            <label className="block text-sm text-gray-600 w-full">Открытие рег.
              <input name="registrationOpensAt" type="datetime-local" defaultValue={dtLocal(event.registrationOpensAt)} className="w-full border rounded px-3 py-2" />
            </label>
            <label className="block text-sm text-gray-600 w-full">Закрытие рег.
              <input name="registrationClosesAt" type="datetime-local" defaultValue={dtLocal(event.registrationClosesAt)} className="w-full border rounded px-3 py-2" />
            </label>
          </div>
          <label className="block text-sm text-gray-600 w-40">Комиссия тренера (₽)
            <input name="coachCommission" type="number" min={0} defaultValue={event.coachCommission} className="w-full border rounded px-3 py-2" />
          </label>
          <button className="rounded bg-blue-600 px-4 py-2 text-white">Сохранить</button>
        </form>
      </section>

      {/* Тиры цен */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Тиры цен ({event.priceTiers.length})</h2>
        <table className="text-sm w-full border mb-3">
          <thead className="bg-gray-50"><tr>
            <th className="border px-2 py-1 text-left">Тир</th><th className="border px-2 py-1">С даты</th>
            <th className="border px-2 py-1">1 раздел</th><th className="border px-2 py-1">2 раздела</th><th className="border px-2 py-1">Абс. доплата</th>
          </tr></thead>
          <tbody>
            {event.priceTiers.map((t) => (
              <tr key={t.id}>
                <td className="border px-2 py-1">{t.name}</td>
                <td className="border px-2 py-1 text-center">{t.startsAt.toISOString().slice(0, 10)}</td>
                <td className="border px-2 py-1 text-center">{t.priceOneDivision} ₽</td>
                <td className="border px-2 py-1 text-center">{t.priceBothDivisions} ₽</td>
                <td className="border px-2 py-1 text-center">{t.absoluteSurcharge} ₽</td>
              </tr>
            ))}
            {event.priceTiers.length === 0 && <tr><td className="border px-2 py-2 text-gray-400 text-center" colSpan={5}>тиров нет</td></tr>}
          </tbody>
        </table>
        <form action={addPriceTier.bind(null, event.id)} className="flex flex-wrap gap-2 items-end">
          <input name="name" placeholder="Название" className="border rounded px-2 py-1 text-sm" required />
          <label className="text-xs text-gray-500">с даты<input name="startsAt" type="date" className="border rounded px-2 py-1 text-sm block" required /></label>
          <input name="priceOneDivision" type="number" placeholder="1 раздел" className="border rounded px-2 py-1 text-sm w-24" required />
          <input name="priceBothDivisions" type="number" placeholder="2 раздела" className="border rounded px-2 py-1 text-sm w-24" required />
          <input name="absoluteSurcharge" type="number" placeholder="абс." defaultValue={0} className="border rounded px-2 py-1 text-sm w-20" />
          <input name="order" type="number" placeholder="порядок" defaultValue={event.priceTiers.length} className="border rounded px-2 py-1 text-sm w-20" />
          <button className="rounded bg-gray-800 text-white px-3 py-1 text-sm">+ тир</button>
        </form>
      </section>

      {/* Категории */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Категории ({event.categories.length})</h2>
        <div className="text-xs max-h-48 overflow-y-auto border rounded p-2 mb-3">
          {event.categories.length === 0 && <span className="text-gray-400">категорий нет</span>}
          {event.categories.map((c) => (
            <div key={c.id} className="py-0.5 border-b last:border-0">
              {c.ageGroupLabel} · {c.sex === "M" ? "муж" : "жен"} · {c.discipline} · {c.isOpenTop ? `св.${c.weightMin ?? ""}` : c.weightMax != null ? `до ${c.weightMax}` : "абс."} {c.isAbsolute ? "(абсолютка)" : ""}
            </div>
          ))}
        </div>
        <details>
          <summary className="text-sm text-blue-600 cursor-pointer">+ добавить категорию вручную</summary>
          <form action={addCategory.bind(null, event.id)} className="flex flex-wrap gap-2 items-end mt-2">
            <input name="ageGroupCode" placeholder="код (adults-2008)" className="border rounded px-2 py-1 text-sm" required />
            <input name="ageGroupLabel" placeholder="название группы" className="border rounded px-2 py-1 text-sm" required />
            <input name="birthYearFrom" type="number" placeholder="год от" className="border rounded px-2 py-1 text-sm w-20" required />
            <input name="birthYearTo" type="number" placeholder="год до" className="border rounded px-2 py-1 text-sm w-20" required />
            <select name="sex" className="border rounded px-2 py-1 text-sm"><option value="M">муж</option><option value="F">жен</option></select>
            <select name="discipline" className="border rounded px-2 py-1 text-sm"><option value="gi">gi</option><option value="nogi">nogi</option></select>
            <input name="weightMin" type="number" step="0.1" placeholder="вес от" className="border rounded px-2 py-1 text-sm w-20" />
            <input name="weightMax" type="number" step="0.1" placeholder="вес до" className="border rounded px-2 py-1 text-sm w-20" />
            <label className="text-xs flex items-center gap-1"><input name="isOpenTop" type="checkbox" value="true" /> св. (open top)</label>
            <label className="text-xs flex items-center gap-1"><input name="isAbsolute" type="checkbox" value="true" /> абсолютка</label>
            <select name="ruleFormat" className="border rounded px-2 py-1 text-sm"><option value="SUBMISSION_ONLY">SUBMISSION_ONLY</option><option value="AGP">AGP</option></select>
            <input name="order" type="number" placeholder="порядок" defaultValue={9000} className="border rounded px-2 py-1 text-sm w-20" />
            <button className="rounded bg-gray-800 text-white px-3 py-1 text-sm">+ категория</button>
          </form>
        </details>
      </section>

      {/* Судьи → ковры */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Судьи на ковры</h2>
        <p className="text-xs text-gray-500 mb-2">Ковров у события: {event.matsCount}</p>
        {refUsers.length === 0 ? (
          <p className="text-sm text-gray-400">нет пользователей с ролью судьи — создайте их в разделе <Link className="text-blue-600" href="/admin/users">Пользователи</Link></p>
        ) : (
          <table className="text-sm w-full border">
            <thead className="bg-gray-50"><tr>
              <th className="border px-2 py-1 text-left">Судья</th><th className="border px-2 py-1">Тек. ковёр</th><th className="border px-2 py-1">Назначить</th>
            </tr></thead>
            <tbody>
              {refUsers.map((u) => (
                <tr key={u.id}>
                  <td className="border px-2 py-1">{u.fullName} <span className="text-gray-400 text-xs">{u.email}</span></td>
                  <td className="border px-2 py-1 text-center">{assignedMat.get(u.id) ?? "—"}</td>
                  <td className="border px-2 py-1">
                    <form action={assignRefereeToMatForm.bind(null, event.id)} className="flex gap-1 justify-center">
                      <input type="hidden" name="userId" value={u.id} />
                      <select name="matNumber" defaultValue={assignedMat.get(u.id) ?? 1} className="border rounded px-2 py-1 text-sm">
                        {matNumbers.map((n) => <option key={n} value={n}>ковёр {n}</option>)}
                      </select>
                      <button className="rounded bg-blue-600 text-white px-3 py-1 text-sm">ок</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
