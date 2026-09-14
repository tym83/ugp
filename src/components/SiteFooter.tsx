import Link from "next/link";
import { CONTACT } from "@/lib/contact";

/** Глобальный футер — на всех страницах, включая личные кабинеты.
 *  Единый контакт турнира (Эмиль): звонок, Telegram, MAX. */
export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-white/10 bg-[#0d0b08] text-[#cec8bc]">
      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="font-black uppercase tracking-wide text-[#f4f0e8]">♛ Underground Grappling</span>
            <div className="mt-1 text-sm">Челябинск · 18+ · грэпплинг — борьба без ударов в голову.</div>
            <div className="mt-2 text-sm">
              <Link href="/privacy" className="hover:text-[#e3863d]">Политика обработки ПДн</Link>
              <span className="mx-2">·</span>© 2026 Underground Grappling
            </div>
          </div>
          <div className="sm:text-right">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-[#8a8378]">По всем вопросам турнира</div>
            <div className="mt-1 font-bold text-[#f4f0e8]">{CONTACT.name}</div>
            <a href={CONTACT.phoneHref} className="mt-1 block text-lg font-bold text-[#e3863d] hover:underline">
              {CONTACT.phoneDisplay}
            </a>
            <div className="mt-2 flex gap-2 sm:justify-end">
              <a href={CONTACT.telegram} target="_blank" rel="noopener noreferrer"
                className="rounded border border-white/20 px-3 py-1 text-sm font-semibold text-[#f4f0e8] hover:border-[#e3863d] hover:text-[#e3863d]">
                Telegram
              </a>
              <span className="rounded border border-white/20 px-3 py-1 text-sm font-semibold text-[#cec8bc]">
                {CONTACT.maxLabel}
              </span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
