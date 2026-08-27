import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Что такое грэпплинг",
  description:
    "Грэпплинг — борьба без ударов, «шахматы на татами». Как это выглядит, короткая история, чем отличается от BJJ, вольной борьбы, самбо, дзюдо и ММА, легенды дисциплины.",
  openGraph: {
    title: "Что такое грэпплинг — борьба, где побеждают головой",
    description:
      "Единоборство без ударов: захваты, контроль, приёмы на сдачу. История, отличия от других единоборств и легенды грэпплинга.",
    images: ["/brand/hero-cover.jpg"],
  },
};

type Star = {
  file: string;
  name: string;
  country: string;
  bio: string;
};

const stars: Star[] = [
  {
    file: "andre.webp",
    name: "Андре Гальвао",
    country: "Бразилия",
    bio: "Многократный чемпион мира IBJJF и чемпион ADCC (в том числе в абсолютной категории), основатель и главный тренер команды Atos. Один из величайших конкурентов и наставников в истории грэпплинга.",
  },
  {
    file: "felipe-pena.jpg",
    name: "Фелипе Пена",
    country: "Бразилия",
    bio: "4-кратный чемпион мира IBJJF по gi и один из немногих, кто побеждал Гордона Райана. Мастер классического джиу-джитсу на высшем уровне.",
  },
  {
    file: "gabi-garcia.jpg",
    name: "Габи Гарсия",
    country: "Бразилия",
    bio: "Самая титулованная женщина в истории BJJ, многократная чемпионка мира и ADCC. Настоящий спектакль и женское лицо грэпплинга.",
  },
  {
    file: "roger-gracie.jpg",
    name: "Роже Грейси",
    country: "Великобритания / Бразилия",
    bio: "Из легендарного клана Грейси, 10-кратный чемпион мира. Эталон чистейшей техники — многие считают его величайшим грэпплером всех времён.",
  },
  {
    file: "craig-jones.jpg",
    name: "Крейг Джонс",
    country: "Австралия",
    bio: "Звезда no-gi, шоумен и мастер атак на ноги. Один из самых медийных и харизматичных грэпплеров планеты.",
  },
  {
    file: "gordon-ryan.jpg",
    name: "Гордон Райан",
    country: "США",
    bio: "Доминирующий no-gi грэпплер своего поколения, многократный чемпион ADCC. «The King» — эталон субмишн-онли борьбы.",
  },
  {
    file: "mikey-musumeci.jpg",
    name: "Мики Музумечи",
    country: "США",
    bio: "Виртуоз игры ног и первый американец — чемпион мира IBJJF по gi. Сделал лег-локи зрелищным искусством.",
  },
  {
    file: "john-danaher.jpg",
    name: "Джон Данахер",
    country: "Новая Зеландия",
    bio: "Самый авторитетный тренер грэпплинга современности, наставник целого поколения чемпионов.",
  },
  {
    file: "marcelo-garcia.jpg",
    name: "Марсело Гарсия",
    country: "Бразилия",
    bio: "Икона и легендарный учитель, 5-кратный чемпион мира и многократный чемпион ADCC. Образец того, как техника бьёт грубую силу.",
  },
  {
    file: "mackenzie-dern.jpg",
    name: "Маккензи Дёрн",
    country: "США / Бразилия",
    bio: "Чемпионка мира по BJJ и звезда UFC. Самое медийное женское имя на стыке грэпплинга и ММА.",
  },
  {
    file: "ffion-davis.jpg",
    name: "Ффион Дэвис",
    country: "Великобритания",
    bio: "Чемпионка ADCC и один из сильнейших женских no-gi технарей мира. Эталон точной, умной борьбы.",
  },
  {
    file: "cassia-mura.jpg",
    name: "Кассия Мура",
    country: "Бразилия",
    bio: "Бразильская грэпплерша высокого уровня, известная агрессивным субмишн-стилем. Новая волна женского no-gi.",
  },
  {
    file: "sara-galvao.jpg",
    name: "Сара Гальвао",
    country: "Бразилия",
    bio: "Бразильская спортсменка-грэпплерша школы Atos. Боец с сильной базой и зрелищной борьбой.",
  },
  {
    file: "helen-crevar.jpg",
    name: "Хелен Кревар",
    country: "Великобритания",
    bio: "Восходящая звезда женского no-gi, призёр крупнейших турниров. Молодое лицо нового поколения.",
  },
  {
    file: "andrew-tackett.jpg",
    name: "Эндрю Такетт",
    country: "США",
    bio: "Молодой американский феномен, известный безбашенным субмишн-стилем и финишами с любой позиции.",
  },
];

type Celeb = {
  file: string;
  name: string;
  bio: string;
};

const celebs: Celeb[] = [
  {
    file: "tom-hardy.jpg",
    name: "Том Харди",
    bio: "Голливудский актёр (Warrior, Venom), практикует BJJ и выигрывал благотворительный jiu-jitsu турнир.",
  },
  {
    file: "henry-cavill.jpg",
    name: "Генри Кавилл",
    bio: "Супермен и Ведьмак, публично рассказывает о тренировках по BJJ.",
  },
  {
    file: "keanu-reeves.webp",
    name: "Киану Ривз",
    bio: "Звезда «Джона Уика» и «Матрицы», занимается джиу-джитсу.",
  },
  {
    file: "jason-momoa.jpg",
    name: "Джейсон Момоа",
    bio: "Аквамен и Кхал Дрого, занимается бразильским джиу-джитсу.",
  },
  {
    file: "guy-ritchie.jpg",
    name: "Гай Ричи",
    bio: "Британский режиссёр (Snatch, Sherlock Holmes), обладатель коричневого пояса по BJJ.",
  },
  {
    file: "demi-lovato.jpg",
    name: "Деми Ловато",
    bio: "Поп-звезда, тренировалась в бразильском джиу-джитсу.",
  },
  {
    file: "gisele-bundchen.jpg",
    name: "Жизель Бюндхен",
    bio: "Супермодель №1, занимается джиу-джитсу.",
  },
  {
    file: "ashton-kutcher.jpg",
    name: "Эштон Кутчер",
    bio: "Актёр и техно-инвестор, обладатель пояса по BJJ.",
  },
  {
    file: "stas-pieha.jpg",
    name: "Стас Пьеха",
    bio: "Российский певец, занимается грэпплингом.",
  },
  {
    file: "chuck-norris.webp",
    name: "Чак Норрис",
    bio: "Легенда боевых искусств и кино, чёрный пояс по бразильскому джиу-джитсу под началом семьи Мачадо.",
  },
];

const differences: { title: string; text: string }[] = [
  {
    title: "Бокс, ММА, кикбоксинг",
    text: "Там бьют руками и ногами. В грэпплинге ударов нет вообще — только борьба и приёмы.",
  },
  {
    title: "Вольная и классическая борьба",
    text: "Борьба — это в основном броски и удержания на очки. В грэпплинге добавляются болевые и удушающие приёмы: схватку можно завершить досрочно.",
  },
  {
    title: "Дзюдо",
    text: "Дзюдо — в кимоно, с упором на броски. Грэпплинг чаще без кимоно (no-gi), с упором на борьбу на полу (партер) и приёмы.",
  },
  {
    title: "Самбо",
    text: "Близкий родственник. Но в боевом самбо есть удары, а в грэпплинге их нет — это чистая борьба на сдачу.",
  },
  {
    title: "BJJ (джиу-джитсу)",
    text: "По сути это и есть грэпплинг. Классическое BJJ — в кимоно; на наших турнирах — формат no-gi, без кимоно: быстрее и динамичнее.",
  },
];

const kicker = "text-sm font-bold uppercase tracking-[0.25em] text-[#e3863d]";

export default function GuidePage() {
  return (
    <main className="min-h-screen bg-[#0d0b08] text-[#f4f0e8]">
      {/* Hero */}
      <section className="relative border-b border-white/10">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/hero-cover.jpg"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 h-full w-full object-cover opacity-25"
          loading="lazy"
        />
        <div className="relative mx-auto max-w-5xl px-6 py-20">
          <Link href="/" className="text-sm text-[#cec8bc] hover:text-[#e3863d]">
            ← на главную
          </Link>
          <p className={`${kicker} mt-8`}>Что такое грэпплинг</p>
          <h1 className="mt-4 max-w-3xl font-black uppercase tracking-tight text-4xl sm:text-5xl md:text-6xl leading-[1.05]">
            Борьба, где побеждают головой, а не кулаками
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-[#cec8bc]">
            Если коротко: грэпплинг — это единоборство без ударов. Никто никого не бьёт.
            Задача — с помощью захватов, борьбы и приёмов перевести соперника в невыгодное
            положение и заставить его сдаться. Это безопасно, зрелищно и понятно, даже если
            вы никогда не занимались спортом.
          </p>
        </div>
      </section>

      {/* How it looks */}
      <section className="mx-auto max-w-5xl px-6 py-12">
        <p className={kicker}>Как это выглядит</p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <p className="text-[#cec8bc] leading-relaxed">
            Два соперника выходят на мягкое покрытие — татами. Они сближаются, берут захваты,
            пытаются повалить друг друга и получить контроль. Дальше — борьба на полу: кто-то
            проводит болевой или удушающий приём, соперник «стучит» рукой (это и есть «сдача»),
            и схватка мгновенно останавливается. Никто никого не калечит: сдаться здесь
            совершенно нормально — это просто конец раунда.
          </p>
          <p className="text-[#cec8bc] leading-relaxed">
            Побеждает не самый сильный физически, а самый техничный и хладнокровный. Поэтому
            грэпплинг часто называют <span className="text-[#f4f0e8] font-semibold">«шахматами на татами»</span>:
            важно думать на несколько шагов вперёд.
          </p>
        </div>
      </section>

      {/* History */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Немного истории</p>
        <div className="mt-6 space-y-5 max-w-3xl text-[#cec8bc] leading-relaxed">
          <p>
            Современный грэпплинг вырос из нескольких борцовских традиций. Главные корни —
            бразильское джиу-джитсу (BJJ), которое семья Грейси развила из японского дзюдо
            в начале XX века, а также вольная и классическая борьба, самбо и дзюдо. В конце
            1990-х появился турнир ADCC (Abu Dhabi Combat Club) — он собрал лучших борцов
            планеты без кимоно и во многом задал современный вид дисциплины.
          </p>
          <p>
            Сегодня грэпплинг — быстрорастущий вид спорта в мире: крупные турниры собирают
            миллионы просмотров, а заниматься им идут и любители, и профессионалы, и даже
            голливудские актёры.
          </p>
        </div>
      </section>

      {/* Differences */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Отличия</p>
        <h2 className="mt-4 font-black uppercase tracking-tight text-3xl sm:text-4xl">
          Чем грэпплинг отличается от других единоборств
        </h2>
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          {differences.map((d) => (
            <div
              key={d.title}
              className="rounded border border-white/10 bg-white/5 p-6"
            >
              <h3 className="font-bold uppercase tracking-wide text-[#e3863d]">
                {d.title}
              </h3>
              <p className="mt-2 text-[#cec8bc] leading-relaxed">{d.text}</p>
            </div>
          ))}
        </div>
        <p className="mt-8 max-w-3xl text-lg text-[#f4f0e8]">
          Главное, что стоит запомнить: грэпплинг — умный и безопасный контактный спорт без
          ударов по голове. Начать можно с нуля в любом возрасте.
        </p>
      </section>

      {/* Legends */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Кто двигает грэпплинг</p>
        <h2 className="mt-4 font-black uppercase tracking-tight text-3xl sm:text-4xl">
          Легенды дисциплины
        </h2>
        <p className="mt-4 max-w-3xl text-[#cec8bc]">
          Имена, на которых равняется весь мир грэпплинга — ориентир уровня, к которому мы
          ведём турнир.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {stars.map((s) => (
            <div
              key={s.file}
              className="group overflow-hidden rounded border border-white/10 bg-white/5"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/stars/${s.file}`}
                  alt={s.name}
                  loading="lazy"
                  className="h-full w-full object-cover grayscale transition duration-500 group-hover:grayscale-0 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <h3 className="font-bold uppercase tracking-wide leading-tight">
                  {s.name}
                </h3>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-[#e3863d]">
                  {s.country}
                </p>
                <p className="mt-3 text-sm text-[#cec8bc] leading-relaxed">{s.bio}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Celebs */}
      <section className="mx-auto max-w-5xl px-6 py-12 border-t border-white/10">
        <p className={kicker}>Грэпплинг в моде</p>
        <h2 className="mt-4 font-black uppercase tracking-tight text-3xl sm:text-4xl">
          Звёзды, которые занимаются грэпплингом
        </h2>
        <p className="mt-4 max-w-3xl text-[#cec8bc]">
          Умная борьба без ударов давно вышла за пределы татами — её выбирают актёры,
          музыканты и режиссёры.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-5">
          {celebs.map((c) => (
            <div
              key={c.file}
              className="group overflow-hidden rounded border border-white/10 bg-white/5"
            >
              <div className="relative aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/celebs/${c.file}`}
                  alt={c.name}
                  loading="lazy"
                  className="h-full w-full object-cover grayscale transition duration-500 group-hover:grayscale-0 group-hover:scale-105"
                />
              </div>
              <div className="p-4">
                <h3 className="font-bold uppercase tracking-wide leading-tight text-sm">
                  {c.name}
                </h3>
                <p className="mt-2 text-xs text-[#cec8bc] leading-relaxed">{c.bio}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12">
          <Link
            href="/"
            className="inline-block rounded bg-[#e3863d] px-6 py-3 font-bold uppercase tracking-wide text-black hover:brightness-110"
          >
            Посмотреть, что будет на турнире →
          </Link>
        </div>
      </section>
    </main>
  );
}
