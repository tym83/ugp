import Link from "next/link";
import { getCurrentUser, homeForRoles, primaryRole, ROLE_LABEL } from "@/lib/auth/session";
import { signOutAction } from "@/app/auth-actions";

const NAV = [
  { href: "/guide", label: "Грэпплинг" },
  { href: "/athletes", label: "Спортсменам" },
  { href: "/sponsors", label: "Спонсорам" },
  { href: "/media", label: "Медиа" },
];

/** Брендовая шапка (тёмная, янтарный акцент). Отражает состояние входа. */
export default async function BrandHeader() {
  const user = await getCurrentUser();
  const roles = user?.memberships.map((m) => m.role) ?? [];
  const role = primaryRole(roles);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d0b08]/95 text-[#f4f0e8] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-black uppercase tracking-wide">
          <span className="text-[#e3863d]">♛</span>
          <span className="text-sm sm:text-base">Underground Grappling</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 text-sm text-[#cec8bc] lg:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="uppercase tracking-wide hover:text-[#e3863d]">
              {n.label}
            </Link>
          ))}
        </nav>

        {user ? (
          <div className="ml-auto flex items-center gap-3 lg:ml-4">
            <Link href={homeForRoles(roles)} className="flex items-center gap-2 hover:text-[#e3863d]">
              {role && <span className="hidden rounded bg-[#e3863d]/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[#e3863d] sm:inline">{ROLE_LABEL[role] ?? role}</span>}
              <span className="max-w-[10rem] truncate text-sm font-semibold">{user.fullName}</span>
            </Link>
            <form action={signOutAction}>
              <button className="rounded border border-white/20 px-3 py-1.5 text-sm text-[#cec8bc] hover:bg-white/10">Выход</button>
            </form>
          </div>
        ) : (
          <Link
            href="/login"
            className="ml-auto rounded border border-[#e3863d]/60 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-[#e3863d] hover:bg-[#e3863d] hover:text-black lg:ml-0"
          >
            Вход
          </Link>
        )}
      </div>
    </header>
  );
}
