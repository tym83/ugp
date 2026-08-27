import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Спонсорам — партнёрство и пакеты",
  description:
    "Встаньте у истоков большого события: охваты по пяти городам Урала, молодая платёжеспособная аудитория 20–45, пакеты партнёрства от Supporter до Title Partner. Скачайте презентацию.",
  openGraph: {
    title: "Спонсорам — Underground Grappling",
    description:
      "Охваты по Уралу, молодая аудитория, живой контакт с брендом и пакеты партнёрства. Скачайте презентацию.",
    images: ["/brand/hero-cover.jpg"],
  },
};

const kicker = "text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]";

const benefits: { title: string; text: string }[] = [
  {
    title: "Охваты по всему Уралу",
    text: "Единая медиакампания по Челябинску, Екатеринбургу, Уфе, Перми и Тюмени: события, соцсети, СМИ, трансляция.",
  },
  {
    title: "Молодая платёжеспособная аудитория 20–45",
    text: "Те, кто увлечён спортом, единоборствами и здоровым образом жизни.",
  },
  {
    title: "Живой контакт",
    text: "Зона вашего бренда и раздача образцов продукции на площадке, ваш продукт в руках у зрителей и в кадре трансляции.",
  },
  {
    title: "Контент",
    text: "Фото, видео и сюжеты до, во время и после события для ваших каналов.",
  },
  {
    title: "Статус «одного из первых»",
    text: "Событие будет расти, и первые партнёры получают приоритет при расширении.",
  },
];

type Tier = {
  flag: string;
  name: string;
  en: string;
  tagline: string;
  items: string[];
};

const tiers: Tier[] = [
  {
    flag: "Флагман",
    name: "Титульный партнёр",
    en: "Title Partner",
    tagline: "Ваше имя — в названии события",
    items: [
      "Нейминг сезона / тура / главного карда",
      "Брендинг ямы и центрального ковра, входная арка и walkout-рампа",
      "Интеграция в трансляцию и presenting-права на Team Challenge",
      "VIP-пакет и backstage, 2–3 корпоративные демо-сессии",
      "Брендированная контент-серия + итоговый медиаотчёт",
    ],
  },
  {
    flag: "Генеральный партнёр",
    name: "Presenting Partner",
    en: "Presenting Partner",
    tagline: "Титул крупного блока шоу",
    items: [
      "Presenting одного блока: main card / Team Challenge / трансляция",
      "Логотип в digital и офлайне, presenting booth",
      "Sponsor reads от ведущего, зона на площадке",
      "Гостевые билеты, один корпоративный формат",
    ],
  },
  {
    flag: "Официальный партнёр",
    name: "Category Partner",
    en: "Category Partner",
    tagline: "Эксклюзив в вашей категории",
    items: [
      "Эксклюзив в категории (recovery, питание, банк, авто, экипировка, hospitality)",
      "Тематическая активация и брендированная зрительская игра",
      "Category booth, sampling, упоминания ведущим",
    ],
  },
  {
    flag: "Партнёр",
    name: "Supporter",
    en: "Supporter",
    tagline: "Заявите о себе аудитории события",
    items: [
      "Стол / booth на площадке, mention от ведущего",
      "Промокод, sampling, welcome pack",
      "1–2 совместных поста в соцсетях",
    ],
  },
];

export default function SponsorsPage() {
  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      {/* Hero */}
      <section className="relative border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/concrete-dark.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20">
          <Link href="/" className="text-sm text-[#cec8bc] hover:text-[#e3863d]">
            ← на главную
          </Link>
          <p className={`${kicker} mt-8`}>Спонсорам</p>
          <h1 className="mt-4 max-w-3xl font-black uppercase tracking-tight text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
            Встаньте у истоков большого события
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#cec8bc]">
            Underground Grappling — это не разовый турнир, а событие для всего Урала,
            которое станет ежегодным. Мы предлагаем партнёрам охваты по пяти городам Урала,
            молодую активную аудиторию и возможность с самого старта быть частью истории.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <a
              href="/underground-grappling-sponsors.pdf"
              download
              className="inline-block rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110"
            >
              Скачать презентацию (PDF)
            </a>
            <a
              href="tel:+79995870924"
              className="inline-block rounded border border-white/20 px-6 py-3 font-bold uppercase tracking-wide text-[#f4f0e8] hover:border-[#e3863d] hover:text-[#e3863d]"
            >
              Запросить пакет
            </a>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className={kicker}>Что получает партнёр</p>
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <div
              key={b.title}
              className="rounded border border-white/10 bg-white/5 p-6"
            >
              <h3 className="font-bold uppercase tracking-wide text-[#e3863d] leading-tight">
                {b.title}
              </h3>
              <p className="mt-3 text-[#cec8bc] leading-relaxed">{b.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tiers */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Пакеты партнёрства</p>
        <h2 className="mt-4 font-black uppercase tracking-tight text-3xl sm:text-4xl">
          Выберите формат под свои задачи
        </h2>
        <p className="mt-4 max-w-3xl text-[#cec8bc]">
          Наполнение и стоимость обсуждаем индивидуально. Полная раскладка — в презентации.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {tiers.map((t) => (
            <div
              key={t.en}
              className="flex flex-col rounded border border-white/10 bg-white/5 p-8"
            >
              <p className="text-xs uppercase tracking-[0.25em] text-[#8a8378]">
                {t.flag}
              </p>
              <h3 className="mt-2 font-black uppercase tracking-wide text-2xl">
                {t.name}
              </h3>
              <p className="text-sm text-[#8a8378]">{t.en}</p>
              <p className="mt-3 text-[#e3863d] font-semibold">{t.tagline}</p>
              <ul className="mt-5 space-y-3">
                {t.items.map((it) => (
                  <li
                    key={it}
                    className="flex gap-3 text-[#cec8bc] leading-relaxed"
                  >
                    <span aria-hidden="true" className="mt-1 shrink-0 text-[#e3863d] font-black">
                      →
                    </span>
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <div className="grid gap-8 md:grid-cols-2 md:items-center">
          <div>
            <p className={kicker}>Обсудить партнёрство</p>
            <h2 className="mt-4 font-black uppercase tracking-tight text-3xl">
              Соберём предложение под ваши задачи
            </h2>
            <p className="mt-4 text-[#cec8bc] leading-relaxed">
              Напишите или позвоните — соберём предложение под ваши задачи и пришлём
              презентацию.
            </p>
          </div>
          <div className="rounded border border-white/10 bg-white/5 p-8">
            <p className="text-sm uppercase tracking-[0.2em] text-[#8a8378]">
              Тимур, спонсорство и медиа
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
            <a
              href="/underground-grappling-sponsors.pdf"
              download
              className="mt-6 inline-block rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110"
            >
              Скачать презентацию (PDF)
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
