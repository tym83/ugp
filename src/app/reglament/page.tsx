import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Положение о соревнованиях",
  description: "Официальное положение открытых соревнований по грэпплингу «Андеграунд Грэпплинг» — правила, категории, регистрация.",
};

const PDF = "/reglament/polozhenie.pdf";

export default function ReglamentPage() {
  return (
    <main className="bg-[#0d0b08] text-[#f4f0e8]">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Link href="/" className="text-sm text-[#e3863d] hover:brightness-125">← на главную</Link>
        <h1 className="mt-2 text-3xl font-black uppercase tracking-tight">Положение о соревнованиях</h1>
        <p className="mt-3 max-w-2xl text-[#cec8bc]">
          Официальное положение открытых соревнований по грэпплингу. Правила, возрастные и весовые категории,
          деление на новичков и опытных, порядок регистрации и требования к участникам.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          <a href={PDF} target="_blank" rel="noopener noreferrer"
            className="rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110">
            Открыть / скачать PDF
          </a>
          <Link href="/" className="rounded border border-white/25 px-6 py-3 font-bold uppercase tracking-wide hover:bg-white/10">
            К турниру
          </Link>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-white/10 bg-white">
          <object data={PDF} type="application/pdf" className="h-[80vh] w-full">
            <p className="p-4 text-sm text-gray-700">
              Не удалось встроить PDF. <a href={PDF} className="text-blue-600 underline">Скачайте положение здесь</a>.
            </p>
          </object>
        </div>
      </div>
    </main>
  );
}
