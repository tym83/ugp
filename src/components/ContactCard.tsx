import { CONTACT } from "@/lib/contact";

/** Карточка контакта Эмиля (тёмная тема, brand). Используется на лендинге и промо-страницах. */
export default function ContactCard({ className = "" }: { className?: string }) {
  return (
    <div className={`rounded-lg border border-white/10 bg-white/5 p-6 ${className}`}>
      <div className="text-lg font-bold text-[#f4f0e8]">{CONTACT.name}</div>
      <div className="mt-1 text-sm text-[#cec8bc]">{CONTACT.role}</div>
      <a href={CONTACT.phoneHref} className="mt-3 block text-xl font-bold text-[#e3863d] hover:underline">
        {CONTACT.phoneDisplay}
      </a>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={CONTACT.whatsapp} target="_blank" rel="noopener noreferrer"
          className="rounded border border-white/20 px-3 py-1.5 text-sm font-semibold text-[#f4f0e8] hover:border-[#e3863d] hover:text-[#e3863d]">
          WhatsApp
        </a>
        <a href={CONTACT.telegram} target="_blank" rel="noopener noreferrer"
          className="rounded border border-white/20 px-3 py-1.5 text-sm font-semibold text-[#f4f0e8] hover:border-[#e3863d] hover:text-[#e3863d]">
          Telegram
        </a>
      </div>
    </div>
  );
}
