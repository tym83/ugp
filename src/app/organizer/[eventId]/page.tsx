import { prisma } from "@/lib/prisma";
import { requirePageRole, seesFinance } from "@/lib/auth/session";
import { levelLabel } from "@/lib/domain/levelLabel";
import RebuildBracketButton from "@/components/RebuildBracketButton";
import { needsMerge, suggestMergeTarget, type MergeCat } from "@/lib/domain/merge";
import Link from "next/link";
import WeighInForm, { WeighInNotice } from "./WeighInForm";
import { MergeButton, LockButton, PaymentSelect, DeleteEntryButton, EntryWithdrawalButton, MatSelect } from "./OrganizerButtons";
import MoveRegistration from "./MoveRegistration";
import RestoreRegistrationButton from "./RestoreRegistrationButton";
import AbsolutePanel from "./AbsolutePanel";
import EntrySearch from "./EntrySearch";
import CategoryFilter from "./CategoryFilter";
import NewCategoryForm from "./NewCategoryForm";
import DropoutsSection from "./DropoutsSection";
import { absoluteRoster, type PaymentKind } from "@/app/organizer-actions";

export const dynamic = "force-dynamic";

// Взвешивание закрыто, как только турнир стартовал (см. organizer-actions.setWeighInLock).
const WEIGH_IN_OPEN_STATUSES = ["DRAFT", "REG_OPEN", "REG_CLOSED"];

const SOURCE_LABEL: Record<string, string> = { self: "сам", coach: "от тренера", organizer: "списком (импорт)" };

export default async function OrganizerConsole({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId: eventParam } = await params;
  const user = await requirePageRole("ORGANIZER", "ADMIN", "MAT_COORDINATOR");

  const event = await prisma.event.findFirst({ where: { OR: [{ slug: eventParam }, { id: eventParam }] } });
  if (!event) return <main className="p-8">Событие не найдено</main>;
  const eventId = event.id; // дальше работаем с реальным id (queries/actions/revalidate)
  const showMoney = seesFinance(user, eventId);

  const categories = await prisma.category.findMany({
    where: { eventId, mergedIntoId: null },
    orderBy: { order: "asc" },
    include: {
      registrations: { include: { athlete: { include: { club: true } } }, orderBy: { createdAt: "asc" } },
      _count: { select: { matches: true } },
    },
  });

  const catLabel = (
    c: Pick<(typeof categories)[number], "ageGroupLabel" | "level" | "sex" | "discipline" | "isAbsolute" | "isOpenTop" | "weightMin" | "weightMax">
  ) =>
    `${c.ageGroupLabel}${levelLabel(c.level) ? " · " + levelLabel(c.level) : ""} · ${c.sex === "M" ? "муж" : "жен"} · ${c.discipline} · ${
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

  // Заявки и статус оплаты (ручной трекинг взноса).
  const entries = await prisma.eventEntry.findMany({
    where: { eventId },
    include: {
      athlete: { select: { id: true, fullName: true, birthDate: true, phone: true, club: { select: { name: true } } } },
      registrations: { include: { category: true } },
    },
    orderBy: [{ paid: "asc" }, { createdAt: "asc" }], // неоплаченные сверху
  });
  // Options for the new-category form (all categories of the event).
  const catOptions = categories.map((c) => ({ id: c.id, label: catLabel(c) }));
  // Отметки до появления paymentKind считаем реальной оплатой.
  const kindOf = (e: { paid: boolean; paymentKind: string | null }) =>
    (e.paymentKind ?? (e.paid ? "PAID" : null)) as PaymentKind | null;
  const reallyPaid = entries.filter((e) => kindOf(e) === "PAID");
  const paidCount = reallyPaid.length;
  const paidSum = reallyPaid.reduce((s, e) => s + e.priceTotal, 0);
  const laterCount = entries.filter((e) => kindOf(e) === "LATER").length;
  const freeCount = entries.filter((e) => kindOf(e) === "FREE").length;
  const isWithdrawn = (e: (typeof entries)[number]) =>
    e.registrations.length > 0 && e.registrations.every((r) => r.status === "WITHDRAWN");
  const withdrawnCount = entries.filter(isWithdrawn).length;
  const totalSum = entries.reduce((s, e) => s + e.priceTotal, 0);
  // Возможные дубли: совпали фамилия и имя (в любом порядке) — человек заявился сам и его заявил тренер.
  const nameKey = (n: string) => n.toLowerCase().replace(/ё/g, "е").split(/\s+/).slice(0, 2).sort().join(" ");
  const nameCount = new Map<string, number>();
  for (const e of entries) nameCount.set(nameKey(e.athlete.fullName), (nameCount.get(nameKey(e.athlete.fullName)) ?? 0) + 1);
  const isDup = (e: (typeof entries)[number]) => (nameCount.get(nameKey(e.athlete.fullName)) ?? 0) > 1;
  const dupCount = entries.filter(isDup).length;

  return (
    <main className="organizer-console mx-auto max-w-6xl p-6">
      <WeighInNotice />
      <div className="oc-card flex flex-wrap items-center justify-between gap-4 p-4">
        <div>
          <Link href={`/event/${event.slug ?? eventId}`} className="text-sm text-blue-700 hover:underline">← {event.name}</Link>
          <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight">Пульт организатора</h1>
          <p className="oc-muted">Статус: {event.status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/organizer/help" className="oc-btn">Инструкция</Link>
          <Link href={`/standings/${eventId}`} className="oc-btn">Командный зачёт →</Link>
          <a href={`/organizer/${event.slug ?? eventId}/offline`} className="oc-btn">Сетки без интернета →</a>
          <a href={`/api/offline/entries?eventId=${eventId}`} className="oc-btn oc-btn-success">Список в Excel</a>
          <a href={`/api/offline/xlsx?eventId=${eventId}`} className="oc-btn oc-btn-success">Сетки в Excel</a>
          <LockButton eventId={eventId} locked={locked} />
        </div>
      </div>

      <section className="oc-section">
        <div className="oc-section-head">
          <h2>Заявки участников</h2>
          <span className="oc-muted">
            реально оплачено {paidCount} из {entries.length}{showMoney && <> · {paidSum} / {totalSum} ₽</>}
            {laterCount > 0 && <> · оплатят позже {laterCount}</>}
            {withdrawnCount > 0 && <> · снято {withdrawnCount}</>}
            {freeCount > 0 && <> · бесплатно {freeCount}</>}
            {dupCount > 0 && <> · <span className="text-red-600">возможных дублей {dupCount}</span></>}
          </span>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">Заявок пока нет.</p>
        ) : (
          <>
          <EntrySearch tableId="entries-table" />
          <div className="oc-card oc-table-scroll">
            <table id="entries-table" className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-2.5">Участник</th>
                  <th className="px-4 py-2.5">Телефон</th>
                  <th className="px-4 py-2.5">Клуб</th>
                  <th className="px-4 py-2.5">Категории и допуск</th>
                  {showMoney && <th className="px-4 py-2.5">Взнос</th>}
                  <th className="px-4 py-2.5">Оплата</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((e) => (
                  <tr key={e.id} data-entry-name={e.athlete.fullName} className={`align-top${e.paid ? "" : " bg-amber-50"}${isWithdrawn(e) ? " opacity-60" : ""}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium">
                        {e.athlete.fullName}
                        {isWithdrawn(e) && <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600">снят</span>}
                        {isDup(e) && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">дубль?</span>}
                      </div>
                      <div className="text-xs text-gray-500">
                        {e.athlete.birthDate.toLocaleDateString("ru-RU", { timeZone: "UTC" })} · {SOURCE_LABEL[e.source] ?? e.source}
                      </div>
                      <div className="mt-1 flex items-center gap-3">
                        <Link href={`/participant/${e.athlete.id}/edit?next=/organizer/${eventId}`} className="text-xs text-blue-600 hover:underline">изменить</Link>
                        <DeleteEntryButton entryId={e.id} paid={e.paid} />
                        <EntryWithdrawalButton entryId={e.id} withdrawn={isWithdrawn(e)} />
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {e.athlete.phone
                        ? <a href={`tel:${e.athlete.phone}`} className="text-blue-600">{e.athlete.phone}</a>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">{e.athlete.club?.name ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="space-y-3">
                        {e.registrations.map((r) => (
                          <div key={r.id} className="space-y-1">
                            <MoveRegistration regId={r.id} currentCatId={r.categoryId} currentLabel={catLabel(r.category)} eventId={eventId} athleteId={e.athleteId} withdrawn={r.status === "WITHDRAWN"} />
                            {r.status === "ENTERED" ? (
                              locked ? (
                                <span className="text-xs text-gray-400">взвешивание закрыто</span>
                              ) : (
                                <WeighInForm registrationId={r.id} declared={r.actualWeight ?? r.declaredWeight} />
                              )
                            ) : (
                              <span className={`text-xs ${r.status === "ADMITTED" ? "text-green-700" : "text-gray-500"}`}>
                                {r.status === "ADMITTED" ? "Допущен" : r.status === "WITHDRAWN" ? "Снят" : r.status === "OVERWEIGHT" ? "Перевес" : r.status}
                                {r.actualWeight != null && ` · ${r.actualWeight} кг`}
                                {r.status === "WITHDRAWN" && <RestoreRegistrationButton registrationId={r.id} />}
                              </span>
                            )}
                          </div>
                        ))}
                        {e.registrations.length === 0 && <span className="text-gray-300">—</span>}
                      </div>
                    </td>
                    {showMoney && <td className="px-4 py-3 tabular-nums whitespace-nowrap">{e.priceTotal} ₽</td>}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <PaymentSelect entryId={e.id} kind={kindOf(e)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>

      <DropoutsSection eventId={eventId} showMoney={showMoney} />

      {suggestions.length > 0 && (
        <section className="oc-section">
          <div className="oc-section-head">
            <h2>Предложения по объединению</h2>
          </div>
          <ul className="oc-card divide-y text-sm">
            {suggestions.map((s) => (
              <li key={s.source.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
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
        <section className="oc-section space-y-4">
          <div className="oc-section-head">
            <h2>Абсолютка</h2>
          </div>
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

      <section className="oc-section space-y-4">
        <div className="oc-section-head">
          <h2>Категории и взвешивание</h2>
          <NewCategoryForm eventPath={event.slug ?? eventId} options={catOptions} />
        </div>
        <CategoryFilter
          containerId={`category-list-${eventId}`}
          ageGroups={[...new Set(categories.map((c) => c.ageGroupLabel))]}
          matsCount={event.matsCount}
        />
        <div id={`category-list-${eventId}`} className="space-y-4">
        {categories.map((c) => {
          const queue = c.registrations.filter((r) => r.status === "ENTERED");
          const admitted = c.registrations
            .filter((r) => r.status === "ADMITTED")
            .sort((a, b) => (a.seed ?? Number.MAX_SAFE_INTEGER) - (b.seed ?? Number.MAX_SAFE_INTEGER));
          return (
            <div
              key={c.id}
              className="oc-card overflow-hidden"
              data-cat={catLabel(c)}
              data-age={c.ageGroupLabel}
              data-sex={c.sex}
              data-disc={c.discipline}
              data-level={c.level}
              data-wmin={c.weightMin ?? ""}
              data-wmax={c.weightMax ?? ""}
              data-open={c.isOpenTop ? "1" : "0"}
              data-abs={c.isAbsolute ? "1" : "0"}
              data-mat={c.matNumber ?? ""}
              data-count={c.registrations.filter((r) => r.status === "ENTERED" || r.status === "ADMITTED").length}
              data-bracket={c._count.matches > 0 ? "1" : "0"}
            >
              <div className="oc-cat-head">
                <div className="min-w-0">
                  <Link href={`/category/${c.id}`} className="font-semibold text-blue-700 hover:underline">{catLabel(c)}</Link>
                  <span className="ml-2 text-xs text-gray-500">
                    допущено {admittedCount(c)} / заявлено {c.registrations.length}
                  </span>
                  {c._count.matches > 0 && <span className="oc-chip oc-chip-green">сетка есть</span>}
                </div>
                <div className="flex items-center gap-2">
                  <MatSelect categoryId={c.id} mat={c.matNumber} matsCount={event.matsCount} />
                  <Link
                    href={`/organizer/${event.slug ?? eventId}/bracket/${c.slug ?? c.id}`}
                    className="oc-btn"
                  >
                    Состав и сетка
                  </Link>
                  <RebuildBracketButton categoryId={c.id} hasBracket={c._count.matches > 0} className="oc-btn oc-btn-primary" />
                </div>
              </div>

              <div className="oc-cat-body">
              {queue.length > 0 && (
                <div>
                  {queue.map((r) => (
                    <div key={r.id} className="oc-row">
                      <span className="min-w-[180px] font-medium">{r.athlete.fullName}</span>
                      <span className="text-xs text-gray-400">заявл. {r.declaredWeight ?? "—"} кг</span>
                      <span className="ml-auto">
                        {locked ? (
                          <span className="text-xs text-gray-400">взвешивание закрыто</span>
                        ) : (
                          <WeighInForm registrationId={r.id} declared={r.declaredWeight} />
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {admitted.length > 0 && (
                <details className="oc-more">
                  <summary>
                    Участники: {admitted.length} — раскрыть
                  </summary>
                  <div>
                    {admitted.map((r) => (
                      <div key={r.id} className="oc-row">
                        <span className="min-w-[180px] font-medium">{r.athlete.fullName}</span>
                        <span className="text-xs text-gray-400">{r.actualWeight ?? r.declaredWeight ?? "—"} кг</span>
                        <span className="text-xs text-gray-400">{r.athlete.club?.name ?? ""}</span>
                      </div>
                    ))}
                  </div>
                </details>
              )}
              </div>
            </div>
          );
        })}
        </div>
      </section>
    </main>
  );
}
