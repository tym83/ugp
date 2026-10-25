// Импорт групповых заявок, присланных организатору (docx/мессенджеры), в событие.
// Категория — «родная» по полу, году рождения и весу (как подсказывает регистрация);
// клуб ищется по шаблону и создаётся при отсутствии (не указан — без клуба); тренер — по фамилии среди COACH.
// Дубли (ФИО + дата рождения уже заявлены на событие) пропускаются.
// По умолчанию dry-run (транзакция откатывается), запись — с флагом --apply.
//
// Данные — JSON на stdin (персональные данные не хранятся в репозитории):
//   { "event": "tankograd", "groups": [{ "club": "...", "clubMatch": "regex", "city": "...",
//     "coach": "Фамилия", "disciplines": ["gi","nogi"], "level"?: "novice" | "experienced",
//     "athletes": [{ "fullName": "...", "birthDate": "YYYY-MM-DD" | "birthYear": 2012, "sex": "M", "weight": 45.1, "placeAsWeight"?: 62 }] }] }
import { PrismaClient, type Prisma } from "@prisma/client";
import { nativeCategory, type Cat } from "../../src/lib/domain/eligibility";
import { selectTier, priceEntry, type Tier } from "../../src/lib/domain/pricing";

// placeAsWeight — решение организатора поставить в категорию не по фактическому весу (перевес)
// birthYear — когда в заявке только год: дата пишется как 1 января, дубли ищутся по году
type AthleteRow = { fullName: string; birthDate?: string; birthYear?: number; sex: "M" | "F"; weight: number; placeAsWeight?: number };
// level — линейка взрослых/ветеранов (новички/опытные); у детей категории «all», уровень не нужен
type Group = { club?: string; clubMatch?: string; city?: string; coach?: string; disciplines: ("gi" | "nogi")[]; level?: string; athletes: AthleteRow[] };
type Input = { event: string; groups: Group[] };

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

class DryRun extends Error {}

function weightLabel(c: { isAbsolute: boolean; isOpenTop: boolean; weightMin: number | null; weightMax: number | null }) {
  return c.isAbsolute ? "абсолютка" : c.isOpenTop ? `свыше ${c.weightMin} кг` : `до ${c.weightMax} кг`;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const ch of process.stdin) chunks.push(ch as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function importGroup(tx: Prisma.TransactionClient, eventId: string, g: Group, cats: (Cat & { label: string })[], tier: Tier) {
  let club: { id: string; name: string } | null = null;
  let clubNote = "без клуба";
  if (g.club) {
    const re = new RegExp(g.clubMatch ?? g.club, "i");
    club = (await tx.club.findMany()).find((c) => re.test(c.name)) ?? null;
    clubNote = club ? `клуб найден: «${club.name}»` : `клуб создан: «${g.club}»`;
    if (!club) club = await tx.club.create({ data: { name: g.club, city: g.city ?? null } });
  }

  let coachUserId: string | null = null;
  if (g.coach) {
    const coach = await tx.user.findFirst({
      where: { fullName: { contains: g.coach }, memberships: { some: { role: "COACH" } } },
    });
    coachUserId = coach?.id ?? null;
  }
  console.log(`\n## ${club?.name ?? "—"}${g.city ? ` (${g.city})` : ""} — ${clubNote}; тренер ${g.coach ?? "—"}: ${coachUserId ? "аккаунт найден" : "аккаунта нет"}`);

  for (const a of g.athletes) {
    const birthDate = new Date(a.birthDate ?? `${a.birthYear}-01-01`);
    const birthYear = birthDate.getUTCFullYear();
    if (Number.isNaN(birthYear)) throw new Error(`${a.fullName}: нет даты/года рождения`);
    const born = a.birthDate ? a.birthDate.split("-").reverse().join(".") : `${birthYear} г.р.`;
    const head = `- ${a.fullName}, ${born}, ${a.weight} кг${a.placeAsWeight ? ` (ставим как ${a.placeAsWeight})` : ""}`;

    const birthWhere = a.birthDate
      ? birthDate
      : { gte: new Date(`${birthYear}-01-01`), lt: new Date(`${birthYear + 1}-01-01`) };
    const same = await tx.athlete.findMany({ where: { fullName: a.fullName, birthDate: birthWhere } });
    const dup = same.length
      ? await tx.eventEntry.findFirst({ where: { eventId, athleteId: { in: same.map((s) => s.id) } } })
      : null;
    if (dup) {
      console.log(`${head} — УЖЕ ЗАЯВЛЕН, пропуск`);
      continue;
    }

    const chosen = g.disciplines.map((d) => ({
      d,
      c: nativeCategory({ sex: a.sex, birthYear, weight: a.placeAsWeight ?? a.weight, level: g.level }, d, cats) as (Cat & { label: string }) | null,
    }));
    const missing = chosen.filter((x) => !x.c).map((x) => x.d);
    if (missing.length) {
      console.log(`${head} — НЕТ КАТЕГОРИИ (${missing.join(", ")}): вес вне сетки своей возрастной группы, пропуск`);
      continue;
    }

    const athlete =
      same.find((s) => s.clubId === (club?.id ?? null)) ??
      (await tx.athlete.create({
        data: { fullName: a.fullName, birthDate, sex: a.sex, city: g.city ?? null, clubId: club?.id ?? null, coachUserId },
      }));
    const found = chosen.map((x) => x.c!);
    const entry = await tx.eventEntry.create({
      data: {
        athleteId: athlete.id, eventId, source: coachUserId ? "coach" : "organizer", coachUserId,
        tierName: tier.name, disciplines: g.disciplines.join(","), priceTotal: priceEntry(tier, { categoryCount: found.length }),
      },
    });
    for (const c of found) {
      await tx.registration.create({
        data: { entryId: entry.id, athleteId: athlete.id, categoryId: c.id, declaredWeight: a.weight, status: "ENTERED" },
      });
    }
    console.log(`${head} → ${found.map((c) => c.label).join("; ")} · ${entry.priceTotal} ₽`);
  }
}

async function main() {
  const input = JSON.parse(await readStdin()) as Input;
  const event = await prisma.event.findUnique({ where: { slug: input.event }, include: { priceTiers: true } });
  if (!event) throw new Error(`событие «${input.event}» не найдено`);
  const tiers: Tier[] = event.priceTiers.map((t) => ({
    name: t.name, startsAt: t.startsAt, priceFirstCategory: t.priceFirstCategory, priceExtraCategory: t.priceExtraCategory,
  }));
  const tier = selectTier(tiers, new Date());
  if (!tier) throw new Error("у события нет тиров цен");
  const raw = await prisma.category.findMany({ where: { eventId: event.id, mergedIntoId: null } });
  const cats = raw.map((c) => ({
    id: c.id, sex: c.sex as "M" | "F", discipline: c.discipline as "gi" | "nogi",
    birthYearFrom: c.birthYearFrom, birthYearTo: c.birthYearTo, weightMin: c.weightMin, weightMax: c.weightMax,
    isOpenTop: c.isOpenTop, isAbsolute: c.isAbsolute, level: c.level,
    label: `${c.ageGroupLabel} · ${c.discipline === "gi" ? "ги" : "ноу-ги"} · ${weightLabel(c)}`,
  }));
  console.log(`[import] ${event.name}, статус ${event.status}, тир «${tier.name}», режим: ${apply ? "APPLY" : "dry-run"}`);

  try {
    await prisma.$transaction(
      async (tx) => {
        for (const g of input.groups) await importGroup(tx, event.id, g, cats, tier);
        if (!apply) throw new DryRun();
      },
      { timeout: 60_000 }
    );
    console.log("\n[import] применено");
  } catch (e) {
    if (e instanceof DryRun) console.log("\n[import] dry-run: изменения откатаны, для записи — --apply");
    else throw e;
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error("[import] ошибка:", e instanceof Error ? e.message : e);
    await prisma.$disconnect();
    process.exit(1);
  });
