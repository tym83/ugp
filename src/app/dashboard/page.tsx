import { requirePageRole } from "@/lib/auth/session";
import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS: { role: string; href: string; t: string; d: string }[] = [
  { role: "ATHLETE", href: "/me", t: "Мои схватки", d: "Профиль, заявки и «моя следующая схватка»." },
  { role: "COACH", href: "/coach", t: "Кабинет тренера", d: "Заявка группы, взносы и оплаты." },
  { role: "REFEREE", href: "/referee", t: "Судейство", d: "Ваши ковры и матчи к вводу результата." },
  { role: "MAT_COORDINATOR", href: "/referee", t: "Координатор ковра", d: "Матчи и порядок на ковре." },
  { role: "ORGANIZER", href: "/organizer", t: "Организатор", d: "События, судьи, взвешивание, сетки, зачёт." },
  { role: "ADMIN", href: "/admin", t: "Админ", d: "Пользователи, роли, события." },
];

export default async function DashboardPage() {
  const user = await requirePageRole();
  const roles = new Set(user.memberships.map((m) => m.role));
  const seen = new Set<string>();
  const cards = CARDS.filter((c) => roles.has(c.role) && !seen.has(c.href) && seen.add(c.href));

  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      <div className="mx-auto max-w-3xl px-6 py-10">
        <h1 className="text-3xl font-black uppercase tracking-tight">Вы вошли как {user.fullName}</h1>
        <p className="mt-1 text-[#cec8bc]">Выберите раздел:</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {cards.map((c) => (
            <Link key={c.href} href={c.href} className="rounded-lg border border-white/10 bg-white/5 p-5 hover:border-[#e3863d]/60">
              <div className="font-bold uppercase tracking-wide">{c.t}</div>
              <p className="mt-1 text-sm text-[#cec8bc]">{c.d}</p>
            </Link>
          ))}
          {cards.length === 0 && (
            <Link href="/me" className="rounded-lg border border-white/10 bg-white/5 p-5 hover:border-[#e3863d]/60">
              <div className="font-bold uppercase tracking-wide">Мои схватки</div>
              <p className="mt-1 text-sm text-[#cec8bc]">Профиль и заявки участника.</p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
