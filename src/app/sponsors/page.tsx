import Link from "next/link";

export const metadata = {
  title: "Спонсорам — пакеты и контакты",
  description: "Спонсорские пакеты по запросу. Прямой контакт с аудиторией грэпплинг- и BJJ-комьюнити на турнирах.",
};

const tiers = [
  { name: "Title", desc: "Титульный спонсор события: нейминг, логотип на баннерах и трансляции." },
  { name: "Gold", desc: "Логотип на ковре и в программе, упоминания в анонсах." },
  { name: "Partner", desc: "Размещение в списке партнёров и на сайте события." },
];

export default function SponsorsPage() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <Link href="/" className="text-sm text-blue-600">← на главную</Link>
      <h1 className="text-3xl font-bold mt-2">Спонсорам</h1>
      <p className="mt-3 text-gray-600">
        Прямой доступ к активной аудитории грэпплинг- и BJJ-комьюнити: участники, тренеры, клубы и зрители.
      </p>

      <section className="mt-8 space-y-3">
        {tiers.map((t) => (
          <div key={t.name} className="rounded-lg border p-5">
            <div className="flex items-center justify-between">
              <div className="font-semibold">{t.name}</div>
              <div className="text-sm text-gray-500">стоимость по запросу</div>
            </div>
            <p className="mt-1 text-sm text-gray-600">{t.desc}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-xl font-semibold mb-2">Контакт</h2>
        <p className="text-sm text-gray-700">
          По вопросам спонсорства напишите нам:{" "}
          <a href="mailto:sponsors@ugp.local" className="text-blue-600">sponsors@ugp.local</a>.
        </p>
      </section>
    </main>
  );
}
