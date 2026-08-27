import { prisma } from "@/lib/prisma";
import { requirePageRole } from "@/lib/auth/session";
import { buildBracketAction } from "@/app/actions";
import { needsMerge, suggestMergeTarget, type MergeCat } from "@/lib/domain/merge";
import Link from "next/link";
import WeighInForm from "./WeighInForm";
import { MergeButton, LockButton } from "./OrganizerButtons";
import AbsolutePanel from "./AbsolutePanel";
import { absoluteRoster } from "@/app/organizer-actions";

export const dynamic = "force-dynamic";

// Взвешивание закрыто, как только турнир стартовал (см. organizer-actions.setWeighInLock).
const WEIGH_IN_OPEN_STATUSES = ["DRAFT", "REG_OPEN", "REG_CLOSED"];

export default async function OrganizerConsole({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  await requirePageRole("ORGANIZER", "ADMIN", "MAT_COORDINATOR");

  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) return <main className="p-8">Событие не найдено</main>;

  const categories = await prisma.category.findMany({
    where: { eventId, mergedIntoId: null },
    orderBy: { order: "asc" },
    include: {
      registrations: { include: { athlete: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { matches: true } },
    },
  });

  const catLabel = (c: (typeof categories)[number]) =>
    `${c.ageGroupLabel} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline} · ${
      c.isAbsolute ? "абс" : c.isOpenTop ? `св.${c.weightMin}` : `до${c.weightMax}`
    }`;

  const admittedCount = (c: (typeof categories)[number]) => c.registrations.filter((r) => r.status === "ADMITTED").length;

  // Merge suggestions по допущенным участникам.
  const mergeCats: MergeCat[] = categories.map((c) => ({
    id: c.id,
    sex: c.sex as "M" | "F",
    discipline: c.discipline as "gi" | "nogi",
    ageGroupCode: c.ageGroupCode,
    weightMax: c.weightMax,
    isOpenTop: c.isOpenTop,
    isAbsolute: c.isAbsolute,
    count: admittedCount(c),
    minParticipants: c.minParticipants,
  }));
  const labelById = new Map(categories.map((c) => [c.id, catLabel(c)]));
  const suggestions = needsMerge(mergeCats)
    .map((mc) => ({ source: mc, target: suggestMergeTarget(mc, mergeCats) }))
    .filter((s) => s.target);

  const locked = !WEIGH_IN_OPEN_STATUSES.includes(event.status);

  // Абсолютки: ростер + кандидаты для регистрации на месте.
  const absoluteCats = categories.filter((c) => c.isAbsolute);
  const absoluteData = await Promise.all(
    absoluteCats.map(async (c) => ({
      id: c.id,
      label: catLabel(c),
      hasBracket: c._count.matches > 0,
      ...(await absoluteRoster(c.id, "")),
    }))
  );

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/event/${eventId}`} className="text-sm text-blue-600">← {event.name}</Link>
          <h1 className="text-2xl font-bold">Пульт организатора</h1>
          <p className="text-sm text-gray-500">Статус: {event.status}</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href={`/standings/${eventId}`} className="text-sm text-blue-600">Командный зачёт →</Link>
          <LockButton eventId={eventId} locked={locked} />
        </div>
      </div>

      {suggestions.length > 0 && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold mb-2">Предложения по объединению</h2>
          <ul className="space-y-1 text-sm">
            {suggestions.map((s) => (
              <li key={s.source.id} className="flex items-center gap-2">
                <span>
                  {labelById.get(s.source.id)} <span className="text-gray-400">({s.source.count} чел.)</span> →
                </span>
                <MergeButton sourceId={s.source.id} targetId={s.target!.id} targetLabel={labelById.get(s.target!.id) ?? "?"} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {absoluteData.length > 0 && (
        <section className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold">Абсолютка</h2>
          {absoluteData.map((a) => (
            <AbsolutePanel
              key={a.id}
              categoryId={a.id}
              label={a.label}
              roster={a.roster}
              candidates={a.candidates}
              hasBracket={a.hasBracket}
            />
          ))}
        </section>
      )}

      <section className="mt-8 space-y-6">
        <h2 className="text-lg font-semibold">Категории и взвешивание</h2>
        {categories.map((c) => {
          const queue = c.registrations.filter((r) => r.status === "ENTERED");
          const generate = buildBracketAction.bind(null, c.id);
          return (
            <div key={c.id} className="rounded border">
              <div className="flex items-center justify-between bg-gray-50 px-3 py-2">
                <div>
                  <Link href={`/category/${c.id}`} className="font-medium text-blue-700">{catLabel(c)}</Link>
                  <span className="ml-2 text-xs text-gray-500">
                    допущено {admittedCount(c)} / заявлено {c.registrations.length}
                    {c._count.matches > 0 ? " · сетка есть" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {c._count.matches > 0 && (
                    <Link
                      href={`/organizer/${eventId}/bracket/${c.id}`}
                      className="rounded border px-3 py-1 text-xs text-blue-700"
                    >
                      Правка сетки
                    </Link>
                  )}
                  <form action={generate}>
                    <button className="rounded bg-blue-600 px-3 py-1 text-xs text-white">
                      {c._count.matches ? "Пересобрать сетку" : "Сгенерировать сетку"}
                    </button>
                  </form>
                </div>
              </div>

              {queue.length > 0 && (
                <table className="w-full text-sm">
                  <tbody>
                    {queue.map((r) => (
                      <tr key={r.id} className="border-t">
                        <td className="px-3 py-1">{r.athlete.fullName}</td>
                        <td className="px-3 py-1 text-gray-400">заявл. {r.declaredWeight ?? "—"} кг</td>
                        <td className="px-3 py-1">
                          {locked ? (
                            <span className="text-xs text-gray-400">взвешивание закрыто</span>
                          ) : (
                            <WeighInForm registrationId={r.id} declared={r.declaredWeight} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          );
        })}
      </section>
    </main>
  );
}
