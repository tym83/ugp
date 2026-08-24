import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { createUser, grantMembership, revokeMembership } from "@/app/admin-actions";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const ROLES = ["ADMIN", "ORGANIZER", "COACH", "REFEREE", "MAT_COORDINATOR", "ATHLETE"];

export default async function AdminUsersPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const isAdmin = user.memberships.some((m) => m.role === "ADMIN");
  if (!isAdmin) return <main className="p-8">Управление пользователями — только для администратора.</main>;

  const [users, events, clubs] = await Promise.all([
    prisma.user.findMany({ include: { memberships: true }, orderBy: { createdAt: "asc" } }),
    prisma.event.findMany({ orderBy: { date: "desc" }, select: { id: true, name: true } }),
    prisma.club.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const eventName = new Map(events.map((e) => [e.id, e.name]));
  const clubName = new Map(clubs.map((c) => [c.id, c.name]));

  return (
    <main className="mx-auto max-w-4xl p-6 space-y-8">
      <div>
        <Link className="text-sm text-blue-600" href="/admin">← к списку</Link>
        <h1 className="text-2xl font-bold mt-2">Пользователи и роли</h1>
      </div>

      {/* Создать пользователя */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Новый пользователь</h2>
        <form action={createUser} className="flex flex-wrap gap-2 items-end">
          <input name="fullName" placeholder="ФИО" className="border rounded px-2 py-1 text-sm" required />
          <input name="email" type="email" placeholder="email" className="border rounded px-2 py-1 text-sm" required />
          <input name="password" type="text" placeholder="пароль" className="border rounded px-2 py-1 text-sm" required />
          <button className="rounded bg-blue-600 text-white px-3 py-1 text-sm">Создать</button>
        </form>
      </section>

      {/* Список пользователей */}
      <section>
        <h2 className="text-lg font-semibold mb-2">Пользователи ({users.length})</h2>
        <div className="space-y-4">
          {users.map((u) => (
            <div key={u.id} className="border rounded p-3">
              <div className="flex justify-between items-baseline">
                <div><b>{u.fullName}</b> <span className="text-gray-400 text-sm">{u.email}</span></div>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {u.memberships.map((m) => (
                  <span key={m.id} className="inline-flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-xs">
                    {m.role}
                    {m.scope !== "PLATFORM" && <span className="text-gray-500">/{m.scope}</span>}
                    {m.eventId && <span className="text-gray-500">· {eventName.get(m.eventId) ?? m.eventId}</span>}
                    {m.clubId && <span className="text-gray-500">· {clubName.get(m.clubId) ?? m.clubId}</span>}
                    {m.matNumber != null && <span className="text-gray-500">· ковёр {m.matNumber}</span>}
                    <form action={revokeMembership.bind(null, m.id)}><button className="text-red-500 ml-1">✕</button></form>
                  </span>
                ))}
                {u.memberships.length === 0 && <span className="text-xs text-gray-400">ролей нет</span>}
              </div>

              <details className="mt-2">
                <summary className="text-xs text-blue-600 cursor-pointer">+ выдать роль</summary>
                <form action={grantMembership} className="flex flex-wrap gap-2 items-end mt-2">
                  <input type="hidden" name="userId" value={u.id} />
                  <select name="role" className="border rounded px-2 py-1 text-sm">
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <select name="scope" className="border rounded px-2 py-1 text-sm">
                    <option value="PLATFORM">PLATFORM</option>
                    <option value="EVENT">EVENT</option>
                    <option value="CLUB">CLUB</option>
                  </select>
                  <select name="eventId" className="border rounded px-2 py-1 text-sm">
                    <option value="">— событие —</option>
                    {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                  <select name="clubId" className="border rounded px-2 py-1 text-sm">
                    <option value="">— клуб —</option>
                    {clubs.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <input name="matNumber" type="number" min={1} placeholder="ковёр" className="border rounded px-2 py-1 text-sm w-20" />
                  <button className="rounded bg-gray-800 text-white px-3 py-1 text-sm">Выдать</button>
                </form>
              </details>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
