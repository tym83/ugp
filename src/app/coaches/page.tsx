import Link from "next/link";

export const metadata = {
  title: "Тренерам и клубам — командные призы и заявка списком",
  description: "Заявляйте команду в один экран, ученики регистрируются со скидкой по вашей ссылке, боритесь за командные призы 30/20/10 тыс. ₽.",
};

export default function CoachesPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="text-sm text-blue-600">← на главную</Link>
      <h1 className="text-3xl font-bold mt-2">Тренерам и клубам</h1>
      <p className="mt-3 text-gray-600">
        Заявляйте команду через кабинет тренера, приводите учеников со скидкой и боритесь за командные призы.
      </p>

      <section className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border p-5">
          <div className="text-3xl font-bold">Дешевле по ссылке</div>
          <p className="mt-1 text-sm text-gray-500">ученики, которые регистрируются по вашей персональной ссылке, получают скидку на взнос.</p>
        </div>
        <div className="rounded-lg border p-5">
          <div className="text-3xl font-bold">30 / 20 / 10 тыс. ₽</div>
          <p className="mt-1 text-sm text-gray-500">призовой фонд командного зачёта за 1-е, 2-е и 3-е места.</p>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-2">Как это работает</h2>
        <ol className="list-decimal ml-6 space-y-1 text-sm text-gray-700">
          <li>Заявляете команду одним экраном — по каждому спортсмену отмечаете нужные категории (можно несколько, включая абсолютку).</li>
          <li>Или раздаёте персональную ссылку — ученики регистрируются сами со скидкой и попадают в вашу команду.</li>
          <li>Очки за победы спортсменов идут в командный зачёт клуба.</li>
        </ol>
      </section>

      <div className="mt-8">
        <Link href="/coach" className="rounded bg-blue-600 px-5 py-2.5 text-white font-semibold">Кабинет тренера →</Link>
      </div>
    </main>
  );
}
