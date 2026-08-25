import { describe, it, expect } from "vitest";
import { prisma } from "@/lib/prisma";
import { buildBracketForCategory } from "@/lib/domain/persistBracket";
import { submitResult, correctResult } from "@/lib/domain/results";

let seq = 0;
async function makeCategory(n: number, opts: { bracketType?: string } = {}) {
  const event = await prisma.event.create({
    data: { name: `T${seq++}`, city: "Челябинск", date: new Date("2026-11-22"), status: "REG_OPEN" },
  });
  const cat = await prisma.category.create({
    data: {
      eventId: event.id, ageGroupCode: "adults", ageGroupLabel: "Взрослые", birthYearFrom: 1980, birthYearTo: 2008,
      sex: "M", discipline: "gi", bracketType: opts.bracketType ?? "SINGLE_ELIM",
    },
  });
  for (let i = 0; i < n; i++) {
    const ath = await prisma.athlete.create({ data: { fullName: `Боец ${seq}-${i}`, birthDate: new Date("2000-01-01"), sex: "M" } });
    const entry = await prisma.eventEntry.create({ data: { athleteId: ath.id, eventId: event.id } });
    await prisma.registration.create({ data: { entryId: entry.id, athleteId: ath.id, categoryId: cat.id, status: "ADMITTED", seed: i + 1 } });
  }
  return { event, cat };
}

const readyMatches = (categoryId: string) =>
  prisma.match.findMany({ where: { categoryId, status: { not: "COMPLETED" }, slotAAthleteId: { not: null }, slotBAthleteId: { not: null } } });

async function playAll(categoryId: string) {
  for (let guard = 0; guard < 30; guard++) {
    const ready = await readyMatches(categoryId);
    if (!ready.length) break;
    for (const m of ready) {
      await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: `p-${m.id}` });
    }
  }
}

describe("integration: bracket build + BYE", () => {
  it("5 бойцов → сетка строится, BYE авто-завершаются, все матчи доигрываются", async () => {
    const { cat } = await makeCategory(5);
    const res = await buildBracketForCategory(cat.id);
    expect(res.matches).toBeGreaterThan(0);
    await playAll(cat.id);
    const open = await readyMatches(cat.id);
    expect(open.length).toBe(0);
    const bronze = await prisma.match.findFirst({ where: { categoryId: cat.id, isBronzeMatch: true } });
    // бронза не должна содержать пустой слот после разбора BYE
    if (bronze) expect(bronze.slotAAthleteId && bronze.slotBAthleteId).toBeTruthy();
  });
});

describe("integration: submitResult", () => {
  it("идемпотентность по clientMutationId", async () => {
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const m = (await readyMatches(cat.id))[0];
    const r1 = await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "idem-1" });
    const r2 = await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "idem-1" });
    expect(r1.idempotent).toBe(false);
    expect(r2.idempotent).toBe(true);
    expect(r2.resultId).toBeDefined();
  });

  it("иммутабельность: повторный ввод на завершённом матче другим cmid → ошибка", async () => {
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const m = (await readyMatches(cat.id))[0];
    await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "imm-1" });
    await expect(
      submitResult({ matchId: m.id, winnerAthleteId: m.slotBAthleteId!, winType: "POINTS", clientMutationId: "imm-2" })
    ).rejects.toThrow();
  });

  it("победитель не из слотов → ошибка", async () => {
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const m = (await readyMatches(cat.id))[0];
    await expect(
      submitResult({ matchId: m.id, winnerAthleteId: "not-a-participant", winType: "SUBMISSION", clientMutationId: "bad-1" })
    ).rejects.toThrow();
  });
});

describe("integration: rebuild guard", () => {
  it("пересборка поверх финализированного результата запрещена без force", async () => {
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const m = (await readyMatches(cat.id))[0];
    await submitResult({ matchId: m.id, winnerAthleteId: m.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "rb-1" });
    await expect(buildBracketForCategory(cat.id)).rejects.toThrow();
    await expect(buildBracketForCategory(cat.id, { force: true })).resolves.toBeTruthy();
  });
});

describe("integration: correctResult (гл. судья)", () => {
  it("исправление до игры зависимого матча пере-продвигает победителя", async () => {
    const head = await prisma.user.create({ data: { email: `head${seq++}@t.local`, fullName: "Гл. судья", passwordHash: "x" } });
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const semi = (await readyMatches(cat.id))[0];
    await submitResult({ matchId: semi.id, winnerAthleteId: semi.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "corr-semi" });

    // финал, куда продвинулся победитель полуфинала
    const dependent = await prisma.match.findFirst({
      where: { categoryId: cat.id, OR: [{ slotAFromMatchId: semi.id }, { slotBFromMatchId: semi.id }] },
    });
    expect(dependent).toBeTruthy();

    await correctResult({ matchId: semi.id, winnerAthleteId: semi.slotBAthleteId!, winType: "DECISION", headJudgeUserId: head.id, reason: "видеоповтор" });

    const semiAfter = await prisma.match.findUnique({ where: { id: semi.id } });
    expect(semiAfter!.winnerAthleteId).toBe(semi.slotBAthleteId);
    const depAfter = await prisma.match.findUnique({ where: { id: dependent!.id } });
    const fedSlot = depAfter!.slotAFromMatchId === semi.id ? depAfter!.slotAAthleteId : depAfter!.slotBAthleteId;
    expect(fedSlot).toBe(semi.slotBAthleteId); // пере-продвинули нового победителя
  });

  it("исправление после игры зависимого матча запрещено (нужен ручной каскад)", async () => {
    const head = await prisma.user.create({ data: { email: `head${seq++}@t.local`, fullName: "Гл. судья", passwordHash: "x" } });
    const { cat } = await makeCategory(4);
    await buildBracketForCategory(cat.id);
    const semi = (await readyMatches(cat.id))[0];
    await submitResult({ matchId: semi.id, winnerAthleteId: semi.slotAAthleteId!, winType: "SUBMISSION", clientMutationId: "casc-semi" });
    await playAll(cat.id); // доигрываем всё, включая финал (зависимый)
    await expect(
      correctResult({ matchId: semi.id, winnerAthleteId: semi.slotBAthleteId!, winType: "DECISION", headJudgeUserId: head.id })
    ).rejects.toThrow();
  });
});
