// Разовая миграция данных уже созданного события (без пересоздания категорий):
//   1. взрослые мужчины: «свыше 88» → «до 99» + «свыше 99» (ги/ноу-ги, все уровни);
//      заявки с весом ≤ 99 переезжают в «до 99», без веса — остаются и выводятся в отчёт;
//   2. абсолютка ноу-ги по образцу существующей абсолютки ги.
// Идемпотентна. По умолчанию dry-run (транзакция откатывается), запись — с флагом --apply.
//
// В проде (из корня репозитория):
//   docker compose --env-file .env -f deploy/docker-compose.prod.yml --profile tools run --rm seed \
//     npx tsx prisma/data-migrations/2026-10-13-adults-99-nogi-absolute.ts [--apply] [--event tankograd]
import { PrismaClient, type Category, type Prisma } from "@prisma/client";
import { categorySlug } from "../../src/lib/slug";

const AGE_GROUP = "adults-2008";
const OLD_TOP = 88;
const NEW_MAX = 99;

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");
const eventArg = process.argv.indexOf("--event");
const eventSlug = eventArg > 0 ? process.argv[eventArg + 1] : "tankograd";

class DryRun extends Error {}

/** Поля категории для копии (без идентичности, связей и состояния сетки). */
const NOT_CLONED = ["id", "slug", "mergedIntoId", "bracketVersion", "frozenAt"] as const;
function cloneable(c: Category): Omit<Category, (typeof NOT_CLONED)[number]> {
  const rest: Partial<Category> = { ...c };
  for (const k of NOT_CLONED) delete rest[k];
  return rest as Omit<Category, (typeof NOT_CLONED)[number]>;
}

async function splitTopCategory(tx: Prisma.TransactionClient, evSlug: string, top: Category) {
  const label = `${top.level}/${top.discipline}`;
  const hasMatches = await tx.match.count({ where: { categoryId: top.id } });
  if (top.bracketVersion > 0 || hasMatches > 0) {
    throw new Error(`${label}: у «свыше ${OLD_TOP}» уже есть сетка — делить нельзя`);
  }

  // освобождаем место в порядке: всё, что шло с позиции «свыше 88», сдвигаем на 1
  await tx.category.updateMany({
    where: { eventId: top.eventId, order: { gte: top.order } },
    data: { order: { increment: 1 } },
  });

  const spec = { ...cloneable(top), weightMin: OLD_TOP, weightMax: NEW_MAX, isOpenTop: false, order: top.order };
  const do99 = await tx.category.create({ data: { ...spec, slug: categorySlug(evSlug, spec) } });

  const topSpec = { ...top, weightMin: NEW_MAX };
  await tx.category.update({
    where: { id: top.id },
    data: { weightMin: NEW_MAX, slug: categorySlug(evSlug, topSpec) },
  });

  const regs = await tx.registration.findMany({ where: { categoryId: top.id } });
  let moved = 0;
  const noWeight: string[] = [];
  for (const r of regs) {
    const w = r.actualWeight ?? r.declaredWeight;
    if (w == null) {
      noWeight.push(r.id);
      continue;
    }
    if (w <= NEW_MAX) {
      await tx.registration.update({
        where: { id: r.id },
        data: {
          categoryId: do99.id,
          effectiveCategoryId: r.effectiveCategoryId === top.id ? do99.id : r.effectiveCategoryId,
        },
      });
      moved++;
    }
  }
  console.log(`  ${label}: создана «до ${NEW_MAX}», «свыше ${OLD_TOP}» → «свыше ${NEW_MAX}»; заявок ${regs.length}, перенесено ${moved}`);
  if (noWeight.length) console.log(`    ! без веса, остались в «свыше ${NEW_MAX}» — проверить вручную: ${noWeight.join(", ")}`);
}

async function addNogiAbsolute(tx: Prisma.TransactionClient, evSlug: string, eventId: string) {
  const abs = await tx.category.findMany({ where: { eventId, ageGroupCode: AGE_GROUP, sex: "M", isAbsolute: true } });
  if (abs.some((c) => c.discipline === "nogi")) {
    console.log("  абсолютка ноу-ги уже есть — пропуск");
    return;
  }
  const gi = abs.find((c) => c.discipline === "gi");
  if (!gi) throw new Error("нет абсолютки ги — не с чего копировать");
  const spec = { ...cloneable(gi), discipline: "nogi", order: gi.order + 1, status: "OPEN" };
  await tx.category.create({ data: { ...spec, slug: categorySlug(evSlug, spec) } });
  console.log("  создана абсолютка ноу-ги");
}

async function main() {
  const event = await prisma.event.findUnique({ where: { slug: eventSlug } });
  if (!event?.slug) throw new Error(`событие «${eventSlug}» не найдено`);
  console.log(`[migrate] ${event.name} (${event.slug}), режим: ${apply ? "APPLY" : "dry-run"}`);

  try {
    await prisma.$transaction(
      async (tx) => {
        const tops = await tx.category.findMany({
          where: {
            eventId: event.id, ageGroupCode: AGE_GROUP, sex: "M",
            isOpenTop: true, isAbsolute: false, weightMin: OLD_TOP, mergedIntoId: null,
          },
          orderBy: { order: "asc" },
        });
        if (!tops.length) console.log(`  «свыше ${OLD_TOP}» не найдено — весовые уже разделены`);
        // по убыванию order, чтобы сдвиги не задевали ещё не обработанные категории
        for (const top of [...tops].reverse()) await splitTopCategory(tx, event.slug!, top);

        await addNogiAbsolute(tx, event.slug!, event.id);
        if (!apply) throw new DryRun();
      },
      { timeout: 60_000 }
    );
    console.log("[migrate] применено");
  } catch (e) {
    if (e instanceof DryRun) console.log("[migrate] dry-run: изменения откатаны, для записи — --apply");
    else throw e;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[migrate] ошибка:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
