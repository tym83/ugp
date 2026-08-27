import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Медиа и блогерам",
  description:
    "Информационное партнёрство и медиа-кэмп: несколько недель погружения в грэпплинг, отдельное татами и абсолютная категория для СМИ, именная форма, совместные охваты и готовые сюжеты.",
  openGraph: {
    title: "Медиа и блогерам — Underground Grappling",
    description:
      "Гладиаторское шоу, звёзды и командные бои. Медиа-кэмп, отдельное татами и абсолютка для СМИ, именная форма и общие охваты.",
    images: ["/brand/hero-cover.jpg"],
  },
};

const kicker = "text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]";

const blocks: { title: string; text: string }[] = [
  {
    title: "Контент",
    text: "Гладиаторское шоу, звёзды, командные бои, закулисье и готовые сюжеты для ваших каналов.",
  },
  {
    title: "Охваты",
    text: "Совместное продвижение, упоминания в трансляции и на площадке — работаем на общий охват.",
  },
  {
    title: "Кэмп для СМИ и блогеров",
    text: "Несколько недель мягкого погружения в грэпплинг, отдельный съёмочный день и эксклюзив. Для представителей СМИ — отдельное татами и своя абсолютная категория (без деления по весу), чтобы попробовать спорт на себе.",
  },
  {
    title: "Именная форма и бонусы",
    text: "Именная форма в фирменном стиле события, приветственный набор, фирменная атрибутика, промокоды и бонусы топовым авторам.",
  },
];

export default function MediaPage() {
  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      {/* Hero */}
      <section className="relative border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/gallery/gallery-01.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-20 grayscale"
          loading="lazy"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20">
          <Link href="/" className="text-sm text-[#cec8bc] hover:text-[#e3863d]">
            ← на главную
          </Link>
          <p className={`${kicker} mt-8`}>Медиа и блогерам</p>
          <h1 className="mt-4 max-w-3xl font-black uppercase tracking-tight text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
            Контент, которого нет ни у кого
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#cec8bc]">
            Underground Grappling — это зрелищная картинка, звёзды мирового уровня
            и командные бои город против города. Мы открыты к информационному партнёрству
            и зовём СМИ и блогеров в наш кэмп — несколько недель погружения в грэпплинг.
          </p>
        </div>
      </section>

      {/* Blocks */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-4 md:grid-cols-2">
          {blocks.map((b) => (
            <div
              key={b.title}
              className="rounded border border-white/10 bg-white/5 p-8"
            >
              <h2 className="font-bold uppercase tracking-wide text-[#e3863d]">
                {b.title}
              </h2>
              <p className="mt-3 text-[#cec8bc] leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className={kicker}>Обсудить информационное партнёрство и кэмп</p>
            <h2 className="mt-4 font-black uppercase tracking-tight text-3xl">
              Расскажем про форматы и как попасть на площадку
            </h2>
            <p className="mt-4 text-[#cec8bc] leading-relaxed">
              Напишите или позвоните — расскажем про форматы, кэмп и как попасть
              на площадку.
            </p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-8">
            <p className="text-sm uppercase tracking-[0.2em] text-[#8a8378]">
              Тимур, медиа и партнёрства
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="tel:+79995870924"
                className="text-lg font-bold text-[#f4f0e8] hover:text-[#e3863d]"
              >
                +7 999 587-09-24
              </a>
              <span className="text-[#cec8bc]">
                MAX <span className="text-[#f4f0e8]">+7 999 587-09-24</span>
              </span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
