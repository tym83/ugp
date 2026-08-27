import Link from "next/link";

const NAV = [
  { href: "/guide", label: "Грэпплинг" },
  { href: "/athletes", label: "Спортсменам" },
  { href: "/sponsors", label: "Спонсорам" },
  { href: "/media", label: "Медиа" },
];

/** Брендовая шапка (тёмная, янтарный акцент) — на всех страницах. */
export default function BrandHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d0b08]/95 text-[#f4f0e8] backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-black uppercase tracking-wide">
          <span className="text-[#e3863d]">♛</span>
          <span className="text-sm sm:text-base">Underground Grappling</span>
        </Link>
        <nav className="ml-auto hidden items-center gap-5 text-sm text-[#cec8bc] sm:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="uppercase tracking-wide hover:text-[#e3863d]">
              {n.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/login"
          className="ml-auto rounded border border-[#e3863d]/60 px-3 py-1.5 text-sm font-semibold uppercase tracking-wide text-[#e3863d] hover:bg-[#e3863d] hover:text-black sm:ml-0"
        >
          Вход
        </Link>
      </div>
    </header>
  );
}
