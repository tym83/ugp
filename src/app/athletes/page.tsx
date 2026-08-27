import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Спортсменам и школам",
  description:
    "Не просто один турнир, а целое движение по всему Уралу: призовой фонд, абсолютная категория, командный зачёт, шоу мирового уровня, встреча со звёздами. Спортивным школам — карта грэпплинга, продвижение и поток учеников.",
  openGraph: {
    title: "Спортсменам и школам — Underground Grappling",
    description:
      "Призовой фонд, абсолютка, командный зачёт и вечернее шоу. Школам — место на карте грэпплинга Урала, продвижение и поток учеников.",
    images: ["/brand/hero-cover.jpg"],
  },
};

const kicker = "text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]";

const athletePerks: string[] = [
  "Призовой фонд и абсолютная категория (без деления по весу), командный зачёт",
  "Категории для мужчин и женщин, для новичков и опытных",
  "Вечернее шоу мирового уровня — шанс выйти на большую сцену",
  "Встреча со звёздами: мастер-класс, открытая тренировка, совместное фото",
  "Сильные соперники, фото и видео лучших моментов с ваших схваток",
];

const schoolPerks: string[] = [
  "Медийное продвижение грэпплинга в вашем городе",
  "Место на «Карте грэпплинга Урала» — логотип, город, ваша ссылка на запись",
  "Долгосрочное внимание и поток новых учеников",
  "Включим ваши события в расписание турнира и поможем их организовать",
  "Место в общем движении и внимании спонсоров",
];

function Check() {
  return (
    <span
      aria-hidden="true"
      className="mt-1 shrink-0 text-[#e3863d] font-black"
    >
      →
    </span>
  );
}

export default function AthletesPage() {
  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      {/* Hero */}
      <section className="relative border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/skyline.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-20"
          loading="lazy"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20">
          <Link href="/" className="text-sm text-[#cec8bc] hover:text-[#e3863d]">
            ← на главную
          </Link>
          <p className={`${kicker} mt-8`}>Спортсменам и школам</p>
          <h1 className="mt-4 max-w-3xl font-black uppercase tracking-tight text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
            Не просто один турнир, а целое движение
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#cec8bc]">
            Мы хотим сделать грэпплинг популярным по всему Уралу и зовём спортсменов и школы
            в общее движение — с промо, событиями в городах и большим турниром-финалом
            в Челябинске.
          </p>
        </div>
      </section>

      {/* Athletes */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-2">
          <div className="rounded border border-white/10 bg-white/5 p-8">
            <p className={kicker}>Спортсменам</p>
            <ul className="mt-6 space-y-4">
              {athletePerks.map((p) => (
                <li key={p} className="flex gap-3 text-[#cec8bc] leading-relaxed">
                  <Check />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[#f4f0e8]">
              Побороться со звездой мирового уровня и выйти на сцену, на которую смотрит
              весь Урал.
            </p>
            <div className="mt-8 flex flex-wrap gap-4">
              <Link
                href="/"
                className="inline-block rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110"
              >
                Регистрация откроется позже
              </Link>
              <Link
                href="/coach"
                className="inline-block rounded border border-white/20 px-6 py-3 font-bold uppercase tracking-wide text-[#f4f0e8] hover:border-[#e3863d] hover:text-[#e3863d]"
              >
                Кабинет тренера
              </Link>
            </div>
          </div>

          {/* Schools */}
          <div className="rounded border border-white/10 bg-white/5 p-8">
            <p className={kicker}>Спортивным школам</p>
            <ul className="mt-6 space-y-4">
              {schoolPerks.map((p) => (
                <li key={p} className="flex gap-3 text-[#cec8bc] leading-relaxed">
                  <Check />
                  <span>{p}</span>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-[#f4f0e8]">
              Мы поможем вам с охватами в вашем городе, включим в контур событий турнира
              и дадим продвижение на самой площадке.
            </p>
            <div className="mt-8">
              <Link
                href="/coach"
                className="inline-block rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110"
              >
                Принять участие
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How to join */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Как заявиться</p>
        <div className="mt-6 grid gap-8 md:grid-cols-2">
          <p className="text-[#cec8bc] leading-relaxed">
            Регистрация спортсменов откроется позже — следите за анонсами. Школы и клубы
            могут присоединиться к движению уже сейчас: напишите или позвоните.
          </p>
          <div className="rounded border border-white/10 bg-white/5 p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-[#8a8378]">
              Александр, главный организатор
            </p>
            <p className="mt-1 text-[#cec8bc]">По всем вопросам о турнире</p>
            <div className="mt-4 flex flex-col gap-2">
              <a
                href="tel:+79124058573"
                className="text-lg font-bold text-[#f4f0e8] hover:text-[#e3863d]"
              >
                +7 912 405-85-73
              </a>
              <a
                href="https://t.me/Ug174bjj"
                className="text-[#e3863d] hover:brightness-110"
              >
                @Ug174bjj
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
