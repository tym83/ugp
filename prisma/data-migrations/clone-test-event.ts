// Run from the repository root: npx tsx prisma/data-migrations/clone-test-event.ts [--apply] [--seed N] [--source slug]
import { PrismaClient } from "@prisma/client";
import { prisma as appPrisma } from "@/lib/prisma";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, type SubmitResultInput } from "@/lib/domain/results";
import { placementsFromCategory } from "@/lib/domain/placement";
import { computeTeamScores, type Placement } from "@/lib/domain/teamscore";

const prisma = new PrismaClient();

function options() {
  let apply = false;
  let source = "tankograd";
  let seed = 42;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--apply") apply = true;
    else if (arg === "--source" || arg === "--seed") {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      if (arg === "--source") source = value;
      else {
        seed = Number(value);
        if (!Number.isSafeInteger(seed)) throw new Error("Seed must be a safe integer");
      }
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return { apply, source, seed };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

async function main() {
  const opts = options();
  const targetSlug = `${opts.source}-test`;
  if (await prisma.event.findUnique({ where: { slug: targetSlug } })) {
    console.log(`[clone] ${targetSlug}: уже есть`);
    process.exitCode = 1;
    return;
  }
  const source = await prisma.event.findUniqueOrThrow({ where: { slug: opts.source } });
  const [categories, entries, priceTiers, memberships] = await Promise.all([
    prisma.category.findMany({ where: { eventId: source.id, mergedIntoId: null }, orderBy: [{ order: "asc" }, { id: "asc" }] }),
    prisma.eventEntry.findMany({
      where: { eventId: source.id },
      include: {
        athlete: true,
        registrations: {
          where: { status: { in: ["ENTERED", "ADMITTED"] }, category: { eventId: source.id, mergedIntoId: null } },
          orderBy: { id: "asc" },
        },
      },
      orderBy: { id: "asc" },
    }),
    prisma.priceTier.findMany({ where: { eventId: source.id }, orderBy: { order: "asc" } }),
    prisma.membership.findMany({ where: { scope: "EVENT", eventId: source.id, role: { in: ["ORGANIZER", "HIDE_FINANCE"] } } }),
  ]);
  const registrationCount = entries.reduce((sum, entry) => sum + entry.registrations.length, 0);
  console.log(`[clone] ${opts.source} → ${targetSlug}; seed=${opts.seed}; ${opts.apply ? "APPLY" : "dry-run"}`);
  console.log(`Категорий: ${categories.length}; заявок / новых спортсменов: ${entries.length}; регистраций: ${registrationCount}`);
  console.log(`Ценовых этапов: ${priceTiers.length}; ролей: ${memberships.length}`);
  if (!opts.apply) {
    console.log("План готов. БД не изменена; для записи используйте --apply.");
    return;
  }

  // Commit the clone before domain functions use their own Prisma client and transactions.
  const { eventId, categoryIds } = await prisma.$transaction(async (tx) => {
    const target = await tx.event.create({
      data: { ...source, id: undefined, createdAt: undefined, slug: targetSlug, name: `ТЕСТ — ${source.name}`, status: "COMPLETED" },
    });
    for (const tier of priceTiers) {
      await tx.priceTier.create({ data: { ...tier, id: undefined, eventId: target.id } });
    }
    const categoryMap = new Map<string, string>();
    for (const category of categories) {
      const clone = await tx.category.create({
        data: { ...category, id: undefined, eventId: target.id, slug: null, status: "OPEN", bracketVersion: 0, frozenAt: null },
      });
      categoryMap.set(category.id, clone.id);
    }
    const now = new Date();
    for (const entry of entries) {
      const a = entry.athlete;
      const athlete = await tx.athlete.create({
        data: { fullName: a.fullName, birthDate: a.birthDate, sex: a.sex, city: a.city, clubId: a.clubId, parentConsent: a.parentConsent },
      });
      const clone = await tx.eventEntry.create({
        data: {
          eventId: target.id, athleteId: athlete.id, source: entry.source, tierName: entry.tierName,
          disciplines: entry.disciplines, absoluteAdded: entry.absoluteAdded, priceTotal: entry.priceTotal,
          paid: entry.paid, paymentKind: entry.paymentKind, paidAt: entry.paidAt,
          coachUserId: null, submittedByUserId: null,
        },
      });
      for (const registration of entry.registrations) {
        const categoryId = categoryMap.get(registration.categoryId);
        if (!categoryId) continue;
        await tx.registration.create({
          data: {
            entryId: clone.id, athleteId: athlete.id, categoryId, effectiveCategoryId: categoryId,
            status: "ADMITTED", admittedAt: now, declaredWeight: registration.declaredWeight,
            actualWeight: registration.declaredWeight ?? registration.actualWeight, weighedAt: now,
          },
        });
      }
    }
    for (const membership of memberships) {
      await tx.membership.create({ data: { ...membership, id: undefined, eventId: target.id } });
    }
    return { eventId: target.id, categoryIds: [...categoryMap.values()] };
  }, { timeout: 120_000 });

  for (const categoryId of categoryIds) {
    if (await prisma.registration.count({ where: { categoryId } })) await buildBracketForCategory(categoryId);
  }
  const random = seededRandom(opts.seed);
  const maxIterations = await prisma.match.count({ where: { category: { eventId } } });
  const categoryOrder = new Map(categoryIds.map((id, index) => [id, index]));
  let boutsPlayed = 0;
  while (true) {
    const playable = await prisma.match.findMany({
      where: { category: { eventId }, status: "PENDING", slotAAthleteId: { not: null }, slotBAthleteId: { not: null } },
    });
    if (!playable.length) break;
    // Use source category order rather than newly generated IDs for reproducible simulations.
    playable.sort((a, b) => a.roundNumber - b.roundNumber
      || categoryOrder.get(a.categoryId)! - categoryOrder.get(b.categoryId)!
      || a.positionInRound - b.positionInRound || Number(a.isBronzeMatch) - Number(b.isBronzeMatch));
    for (const match of playable) {
      if (boutsPlayed >= maxIterations) throw new Error("Simulation exceeded the match count; no progress");
      const winnerAthleteId = random() < 0.5 ? match.slotAAthleteId! : match.slotBAthleteId!;
      const roll = random();
      const winType: SubmitResultInput["winType"] = roll < 0.5 ? "SUBMISSION" : roll < 0.8 ? "POINTS" : roll < 0.95 ? "DECISION" : "DQ";
      await submitResult({ matchId: match.id, winnerAthleteId, winType, clientMutationId: `test-${match.id}` });
      boutsPlayed++;
    }
  }

  const completed = await prisma.category.findMany({
    where: { eventId, mergedIntoId: null },
    include: { matches: true, registrations: { include: { athlete: { include: { club: true } } } } },
  });
  const placements: Placement[] = [];
  for (const category of completed) {
    const clubs = new Map<string, { clubId: string; clubName: string }>();
    for (const registration of category.registrations) {
      const club = registration.athlete.club;
      if (club) clubs.set(registration.athleteId, { clubId: club.id, clubName: club.name });
    }
    placements.push(...placementsFromCategory(category, category.matches, (id) => clubs.get(id) ?? null));
  }
  console.log(`Готово: ${targetSlug}; категорий: ${completed.length}; спортсменов: ${entries.length}; боёв сыграно: ${boutsPlayed}`);
  const pending = completed.reduce((sum, category) => sum + category.matches.filter((match) => match.status === "PENDING").length, 0);
  console.log(`Оставшихся PENDING без двух участников: ${pending}`);
  console.log("Топ-5 клубов:");
  for (const score of computeTeamScores(placements).slice(0, 5)) {
    console.log(`${score.place}. ${score.clubName}: ${score.points}`);
  }
}

main().catch((error: unknown) => {
  console.error("[clone] ошибка:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all([prisma.$disconnect(), appPrisma.$disconnect()]);
});
