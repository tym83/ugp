import { prisma } from "@/lib/prisma";
import Link from "next/link";
import Countdown from "@/components/Countdown";
import ContactCard from "@/components/ContactCard";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { text: string; cls: string }> = {
  DRAFT: { text: "черновик", cls: "bg-white/15 text-white" },
  REG_OPEN: { text: "регистрация открыта", cls: "bg-[#e3863d] text-black" },
  REG_CLOSED: { text: "регистрация закрыта", cls: "bg-amber-700 text-white" },
  LIVE: { text: "идёт сейчас", cls: "bg-red-600 text-white" },
  COMPLETED: { text: "завершён", cls: "bg-white/15 text-white" },
};

const GALLERY = ["01", "06", "02", "07", "04", "09", "05", "10"];
const CITIES = ["Челябинск", "Екатеринбург", "Уфа", "Пермь", "Тюмень"];

const kicker = "text-sm font-bold uppercase tracking-[0.28em] text-[#e3863d]";

function Stat({ n, t }: { n: string; t: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-5">
      <div className="text-3xl font-black text-[#e3863d]">{n}</div>
      <div className="mt-1 text-sm text-[#cec8bc]">{t}</div>
    </div>
  );
}

export default async function Home() {
  const events = await prisma.event.findMany({
    orderBy: { date: "asc" },
    include: { _count: { select: { entries: true, categories: true } } },
  });
  const ev = events.find((e) => e.status === "REG_OPEN") ?? events.find((e) => e.status === "LIVE") ?? events[0];
  const st = ev ? STATUS[ev.status] ?? { text: ev.status, cls: "bg-white/15 text-white" } : null;
  const evPath = ev ? (ev.slug ?? ev.id) : "";
  const regHref = ev ? `/register/${evPath}` : "/login";
  const canReg = ev?.status === "REG_OPEN";

  const RegBtn = ({ big }: { big?: boolean }) =>
    canReg ? (
      <Link href={regHref} className={`rounded bg-[#e3863d] font-black uppercase tracking-wide text-black hover:brightness-110 ${big ? "px-8 py-4 text-lg" : "px-6 py-3"}`}>
        Зарегистрироваться
      </Link>
    ) : null;

  return (
    <main className="bg-[#0d0b08] text-[#f4f0e8]">
      {/* HERO — афиша по центру, бока дозаполнены размытой копией афиши (тот же цвет/паттерн) + затемнение */}
      <section className="relative w-full overflow-hidden">
        <div className="absolute inset-0 scale-125 bg-cover bg-center opacity-40 blur-2xl" style={{ backgroundImage: "url(/brand/poster-2026.png)" }} />
        <div className="absolute inset-0 bg-[#0d0b08]/75" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-center px-6 py-12 text-center">
          {/* сама афиша */}
          <div className="aspect-square w-full max-w-md rounded-xl bg-contain bg-center bg-no-repeat shadow-2xl ring-1 ring-white/10" style={{ backgroundImage: "url(/brand/poster-2026.png)" }} />
          {ev ? (
            <>
              <p className="mt-7 max-w-2xl text-lg text-[#e7e2d8] sm:text-xl">
                Борьба без ударов. Шоу с характером. Кульминация турнира — <b className="text-white">сборная Екатеринбурга против Челябинска, 5 на 5</b>.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[#e7e2d8]">
                {st && <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${st.cls}`}>{st.text}</span>}
                <span className="text-lg">{new Date(ev.date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</span>
                {ev.venue && <span>· {ev.venue}</span>}
                <span>· {ev.city}</span>
              </div>
              {canReg && ev.registrationClosesAt && (
                <div className="mt-4 text-[#e7e2d8]"><Countdown target={new Date(ev.registrationClosesAt).toISOString()} /></div>
              )}
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                <RegBtn big />
                <Link href={`/event/${evPath}#divisions`} className="rounded border border-white/30 bg-white/5 px-7 py-4 font-bold uppercase tracking-wide backdrop-blur hover:bg-white/15">
                  Сетки и категории
                </Link>
                <Link href="/guide" className="px-4 py-4 font-semibold text-[#e7e2d8] underline-offset-4 hover:text-[#e3863d] hover:underline">Что такое грэпплинг →</Link>
              </div>
            </>
          ) : (
            <h1 className="mt-6 text-5xl font-black uppercase">Турниры по грэпплингу</h1>
          )}
        </div>
      </section>

      {/* INTRO */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Это будет крутейшее шоу</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-4xl">Один вечер. Три акта. Битва городов в финале.</h2>
          <p className="mt-4 max-w-3xl text-lg text-[#cec8bc]">
            Целый день борьбы, а вечером — большое шоу: именные поединки и Битва городов — сборная
            Екатеринбурга против Челябинска, 5 на 5. Без ударов в голову, но с настоящим накалом. Мы делаем Урал
            столицей грэпплинга и зовём всех: спортсменов, зрителей, школы, бренды и медиа.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat n="300" t="спортсменов на татами" />
            <Stat n="2 000" t="гостей вживую" />
            <Stat n="млн+" t="охваты медиакампании по Уралу" />
            <Stat n="20+" t="локальных событий по городам" />
          </div>
        </div>
      </section>

      {/* ЧТО ТАКОЕ ГРЭППЛИНГ */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Что такое грэпплинг</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Это не драка. Это шахматы на татами.</h2>
          <p className="mt-4 max-w-3xl text-lg text-[#cec8bc]">
            Борьба без ударов: соперники не бьют друг друга, а работают за счёт захватов, контроля и приёмов —
            цель заставить оппонента сдаться. Побеждает не сильнейший, а умнее и техничнее. Безопасно, зрелищно
            и понятно даже без подготовки.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { e: "🛡️", t: "Безопасно", d: "Никаких ударов по голове. Контактный спорт в контролируемой среде — начать можно с нуля." },
              { e: "🧠", t: "Умно", d: "Контроль, позиция, приём. Как в шахматах — на несколько ходов вперёд." },
              { e: "🔥", t: "Зрелищно", d: "Схватка может закончиться в любую секунду. Понятные правила на экране и звёзды на татами." },
              { e: "🤝", t: "Честно", d: "Сдаться — не стыдно, это конец раунда. Техника и хладнокровие важнее грубой силы." },
            ].map((c) => (
              <div key={c.t} className="rounded-lg border border-white/10 bg-white/5 p-5">
                <div className="text-2xl">{c.e}</div>
                <div className="mt-2 font-bold uppercase tracking-wide">{c.t}</div>
                <p className="mt-1 text-sm text-[#cec8bc]">{c.d}</p>
              </div>
            ))}
          </div>
          <Link href="/guide" className="mt-6 inline-block font-semibold text-[#e3863d] hover:underline">Подробнее: история и отличия от BJJ, самбо, дзюдо и ММА →</Link>
        </div>
      </section>

      {/* SUBMISSION-ONLY */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Формат</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-5xl">Submission-only — только чистая победа</h2>
          <p className="mt-4 max-w-3xl text-lg text-[#cec8bc]">
            Никаких очков и судейских решений «на глаз». Победа одна — заставить соперника сдаться: болевой,
            удушающий, сдача. Ничья в основное время решается овертаймом, где всё равно нужно дожать. Это честнее
            и зрелищнее — и такого формата <b className="text-[#f4f0e8]">почти нет в России</b>: обычно судят по
            очкам, а мы даём чистую борьбу до конца.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {[
              { t: "Только сдача", d: "Побеждаешь, когда соперник сдался. Без «набрал очко и убегаю» — до конца." },
              { t: "Без спорных решений", d: "Никаких очков и судейства «на глаз». Всё честно и понятно даже новичку." },
              { t: "Редкость для России", d: "Почти уникальный формат в стране — чистый submission-only на большом шоу." },
            ].map((c) => (
              <div key={c.t} className="rounded-lg border border-white/10 bg-white/5 p-5">
                <div className="font-bold uppercase tracking-wide text-[#e3863d]">{c.t}</div>
                <p className="mt-1 text-sm text-[#cec8bc]">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* БИТВА ГОРОДОВ */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Главное шоу вечера</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight sm:text-5xl">Битва городов — Екатеринбург против Челябинска</h2>
          <p className="mt-4 max-w-3xl text-lg text-[#cec8bc]">
            Вечернее шоу в трёх актах: именные поединки, командная битва город на город 5 на 5 и награждение чемпионов.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { n: "01", t: "Именные поединки", d: "Топовые бойцы один на один. Известные имена и живая интрига — то, ради чего приходят зрители." },
              { n: "02", t: "Битва городов · 5×5", d: "Сборная Екатеринбурга против сборной Челябинска. Победитель остаётся на татами, проигравший уходит. Кульминация вечера." },
              { n: "03", t: "Награждение чемпионов", d: "Итоги дня и вечернего шоу, призы и чествование сильнейших под финал вечера." },
            ].map((c) => (
              <div key={c.n} className="rounded-lg border border-white/10 bg-white/5 p-6">
                <div className="text-4xl font-black text-[#e3863d]">{c.n}</div>
                <div className="mt-2 text-lg font-bold uppercase leading-tight">{c.t}</div>
                <p className="mt-2 text-sm text-[#cec8bc]">{c.d}</p>
              </div>
            ))}
          </div>
          <div className="mt-6 rounded-lg border border-white/10 bg-white/[0.03] p-6">
            <div className="mb-2 font-bold uppercase tracking-wide text-[#e3863d]">Как работает Битва городов</div>
            <ul className="grid gap-2 text-sm text-[#cec8bc] sm:grid-cols-2">
              <li>• Две сборные по 5 бойцов: Екатеринбург и Челябинск.</li>
              <li>• Бьются по очереди: кто выиграл — остаётся на татами и встречает следующего. Каждый бой до сдачи, максимум 3 минуты.</li>
              <li>• Город, чьи бойцы наберут больше побед, забирает Битву городов.</li>
              <li>• Отдельные призы за самую быструю победу и за наибольшее число побед.</li>
            </ul>
          </div>
        </div>
      </section>

      {/* КАК УСТРОЕНО СОБЫТИЕ */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Как устроено событие</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Три этапа: до, во время и после</h2>
          <p className="mt-4 max-w-3xl text-lg text-[#cec8bc]">
            Это не один день, а кампания на несколько месяцев — грэпплинг приходит в города Урала задолго до
            турнира и остаётся после.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[
              { h: "До турнира · лето–осень", t: "Грэпплинг едет в города", li: ["20+ локальных событий: Челябинск, Екатеринбург, Уфа, Пермь, Тюмень", "Открытые тренировки и мастер-классы со школами", "Зачёт городов: кто выставит больше спортсменов"] },
              { h: "День турнира", t: "Турнир днём, шоу вечером", li: ["Открытый турнир: мужчины, женщины, новички и опытные", "Фестиваль: активности, фотозоны, еда, семейная атмосфера", "Вечером — шоу: именные поединки и Битва городов, со звёздами и трансляцией"] },
              { h: "После турнира", t: "Движение не заканчивается", li: ["Нарезки лучших моментов и фильм о турнире", "Локальные события в городах после турнира", "Рейтинг спортсменов и планы на следующий сезон"] },
            ].map((c) => (
              <div key={c.h} className="rounded-lg border border-white/10 bg-white/5 p-6">
                <div className="text-xs font-bold uppercase tracking-widest text-[#e3863d]">{c.h}</div>
                <div className="mt-1 text-lg font-bold">{c.t}</div>
                <ul className="mt-3 space-y-1.5 text-sm text-[#cec8bc]">
                  {c.li.map((x) => <li key={x}>• {x}</li>)}
                </ul>
              </div>
            ))}
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="text-sm text-[#cec8bc]">Города-участники:</span>
            {CITIES.map((c) => (
              <span key={c} className="rounded-full border border-white/15 px-3 py-1 text-sm">{c}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ГАЛЕРЕЯ */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <div className={kicker}>Атмосфера · с прошлых турниров</div>
          <h2 className="mt-3 mb-6 text-3xl font-black uppercase tracking-tight">Борьба, эмоции, характер</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {GALLERY.map((n) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={n} src={`/gallery/gallery-${n}.jpg`} alt="Underground Grappling" loading="lazy"
                className="aspect-[4/3] w-full rounded object-cover grayscale transition hover:grayscale-0" />
            ))}
          </div>
        </div>
      </section>

      {/* ТРЕНЕРАМ И КЛУБАМ */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Тренерам и клубам</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Приводите команду</h2>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-6">
              <div className="font-bold uppercase tracking-wide">Тренерам</div>
              <ul className="mt-3 space-y-1.5 text-sm text-[#cec8bc]">
                <li>• Персональная ссылка — ученики регистрируются по ней дешевле</li>
                <li>• Заявка всей команды в пару кликов, единый список</li>
                <li>• Видите статусы заявок и оплаты своих спортсменов</li>
              </ul>
              <div className="mt-4">
                <Link href="/coach" className="inline-block rounded border border-white/25 px-6 py-3 font-bold uppercase tracking-wide hover:bg-white/10">Кабинет тренера</Link>
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-6">
              <div className="font-bold uppercase tracking-wide">Клубам</div>
              <ul className="mt-3 space-y-1.5 text-sm text-[#cec8bc]">
                <li>• Командный зачёт — борьба за первое место среди клубов</li>
                <li>• Место на «Карте грэпплинга Урала»: логотип и ссылка на запись</li>
                <li>• Медийное продвижение клуба и поток новых учеников</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ОРГАНИЗАТОРЫ */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Кто делает турнир</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Организаторы</h2>
          <p className="mt-3 max-w-2xl text-lg text-[#cec8bc]">Турнир делают практики грэпплинга — те, кто сам на татами и в зале каждый день.</p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-bold">Александр Никитенко</div>
              <div className="mt-1 text-sm text-[#cec8bc]">Основатель турнира · тренер и действующий боец</div>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/5 p-6">
              <div className="text-lg font-bold">Эмиль Якупов</div>
              <div className="mt-1 text-sm text-[#cec8bc]">Соорганизатор турнира</div>
            </div>
          </div>
        </div>
      </section>

      {/* КОНТАКТЫ + CTA */}
      <section className="border-t border-white/10 bg-white/[0.02]">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className={kicker}>Связаться</div>
          <h2 className="mt-3 text-3xl font-black uppercase tracking-tight">Хочешь стать частью турнира?</h2>
          <p className="mt-3 text-lg text-[#cec8bc]">Спортсмен, школа, партнёр или медиа — напиши или позвони. По всем вопросам турнира — Эмиль.</p>
          <div className="mt-6 max-w-md">
            <ContactCard />
          </div>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <RegBtn big />
            <Link href="/sponsors" className="rounded border border-white/25 px-6 py-4 font-bold uppercase tracking-wide hover:bg-white/10">Стать партнёром</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
