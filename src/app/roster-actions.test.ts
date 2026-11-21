import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  category: vi.fn(),
  categoryUpdate: vi.fn(),
  authorize: vi.fn(),
  matchFindUnique: vi.fn(),
  matchFindMany: vi.fn(),
  matchCount: vi.fn(),
  matchUpdateMany: vi.fn(),
  matchUpdate: vi.fn(),
  regFindFirst: vi.fn(),
  regFindUnique: vi.fn(),
  regUpdate: vi.fn(),
  regAggregate: vi.fn(),
  regCount: vi.fn(),
  audit: vi.fn(),
  advance: vi.fn(),
  build: vi.fn(),
  revalidate: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    category: { findUnique: mocks.category },
    match: {
      findUnique: mocks.matchFindUnique,
      findMany: mocks.matchFindMany,
      count: mocks.matchCount,
      updateMany: mocks.matchUpdateMany,
      update: mocks.matchUpdate,
    },
    registration: {
      findFirst: mocks.regFindFirst,
      findUnique: mocks.regFindUnique,
      update: mocks.regUpdate,
      aggregate: mocks.regAggregate,
      count: mocks.regCount,
    },
    $transaction: async (run: (tx: unknown) => unknown) =>
      run({
        category: { update: mocks.categoryUpdate },
        match: { updateMany: mocks.matchUpdateMany, update: mocks.matchUpdate },
        registration: { update: mocks.regUpdate },
      }),
  },
}));
vi.mock("@/lib/auth/session", () => ({ requireEventRole: mocks.authorize }));
vi.mock("@/lib/domain/audit", () => ({ appendAudit: mocks.audit }));
vi.mock("@/lib/domain/bracketStatus", () => ({
  IN_BRACKET: ["ENTERED", "ADMITTED"],
  inBracket: (s: string) => ["ENTERED", "ADMITTED"].includes(s),
}));
vi.mock("@/lib/domain/persistBracket", () => ({ buildBracketForCategory: mocks.build, advanceWinner: mocks.advance }));
vi.mock("@/lib/domain/pricing", () => ({ selectTier: vi.fn(), priceEntry: vi.fn() }));
vi.mock("@/lib/domain/merge", () => ({ canMerge: vi.fn() }));
vi.mock("@/lib/domain/snapshot", () => ({ categoryLabel: vi.fn((c: { ageGroupLabel?: string }) => c.ageGroupLabel ?? "?") }));

import {
  buildSlotEditRows,
  moveAthleteHere,
  reopenBye,
  removeFromCategory,
  setSlot,
  slotDuplicateRefusal,
  walkover,
  type SlotMatchLite,
} from "./roster-actions";

const m = (over: Partial<SlotMatchLite> = {}): SlotMatchLite => ({
  id: "m",
  roundNumber: 1,
  positionInRound: 1,
  isBronzeMatch: false,
  isRoundRobin: false,
  status: "PENDING",
  slotAAthleteId: null,
  slotBAthleteId: null,
  slotAFromMatchId: null,
  slotBFromMatchId: null,
  winnerAthleteId: null,
  hasResult: false,
  winType: null,
  ...over,
});

// Сетка на 8 слотов (5 участников): 1 круг → полуфиналы → бронза перед финалом.
const bracket = () => [
  m({ id: "m1", positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2" }),
  m({ id: "m2", positionInRound: 1, slotAAthleteId: "a3", slotBAthleteId: "a4" }),
  m({ id: "m3", positionInRound: 2, slotAAthleteId: "a5" }),
  m({ id: "m4", positionInRound: 3 }),
  m({ id: "m5", roundNumber: 2, positionInRound: 0, slotAFromMatchId: "m1", slotBFromMatchId: "m2" }),
  m({ id: "m6", roundNumber: 2, positionInRound: 1, slotAFromMatchId: "m3", slotBFromMatchId: "m4" }),
  m({ id: "m7", roundNumber: 3, positionInRound: 1, isBronzeMatch: true, slotAFromMatchId: "m5", slotBFromMatchId: "m6" }),
  m({ id: "m8", roundNumber: 3, positionInRound: 0, slotAFromMatchId: "m5", slotBFromMatchId: "m6" }),
];

describe("buildSlotEditRows (план правки слотов)", () => {
  it("orders rounds with the bronze bout before the final and labels stages", async () => {
    const rows = await buildSlotEditRows(bracket());
    expect(rows.map((r) => r.id)).toEqual(["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
    expect(rows.map((r) => r.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.find((r) => r.id === "m1")!.roundLabel).toBe("Круг 1");
    expect(rows.find((r) => r.id === "m5")!.roundLabel).toBe("Полуфинал");
    expect(rows.find((r) => r.id === "m7")!.roundLabel).toBe("За 3-е место");
    expect(rows.find((r) => r.id === "m8")!.roundLabel).toBe("Финал");
  });

  it("locks slots fed by pending feeders and leaves free slots editable", async () => {
    const rows = await buildSlotEditRows(bracket());
    const semi = rows.find((r) => r.id === "m5")!;
    expect(semi.slotA).toEqual({ athleteId: null, editable: false, feederPending: true, feederNum: 1 });
    expect(semi.slotB).toEqual({ athleteId: null, editable: false, feederPending: true, feederNum: 2 });
    const free = rows.find((r) => r.id === "m4")!;
    expect(free.slotA.editable).toBe(true);
    expect(free.slotB.editable).toBe(true);
  });

  it("allows a walkover only for a lone athlete whose empty slot is not fed by a pending bout", async () => {
    const rows = await buildSlotEditRows(bracket());
    expect(rows.find((r) => r.id === "m3")!.canWalkover).toBe(true);
    expect(rows.find((r) => r.id === "m5")!.canWalkover).toBe(false);
  });

  it("renders played bouts read-only and round-robin stages as tours", async () => {
    const played = await buildSlotEditRows([
      m({ id: "p", slotAAthleteId: "a1", slotBAthleteId: "a2", status: "COMPLETED", hasResult: true, winType: "POINTS", winnerAthleteId: "a1" }),
    ]);
    expect(played[0].hasResult).toBe(true);
    expect(played[0].slotA.editable).toBe(false);
    expect(played[0].isBye).toBe(false);
    expect(played[0].canWalkover).toBe(false);
    const rr = await buildSlotEditRows([m({ id: "r", isRoundRobin: true, roundNumber: 2 })]);
    expect(rr[0].roundLabel).toBe("Тур 2");
  });

  it("flags byes and gates reopenBye only on played dependents", async () => {
    const bye = m({ id: "b", status: "COMPLETED", slotAAthleteId: "a1", winnerAthleteId: "a1" });
    expect((await buildSlotEditRows([bye]))[0].isBye).toBe(true);
    const pendingDep = m({ id: "d", roundNumber: 2, slotAFromMatchId: "b" });
    expect((await buildSlotEditRows([bye, pendingDep])).find((r) => r.id === "b")!.canReopenBye).toBe(true);
    const walkoverDep = m({ id: "d", roundNumber: 2, slotAFromMatchId: "b", status: "COMPLETED", slotAAthleteId: "a1" });
    expect((await buildSlotEditRows([bye, walkoverDep])).find((r) => r.id === "b")!.canReopenBye).toBe(true);
    const playedDep = m({ id: "d", roundNumber: 2, slotAFromMatchId: "b", status: "COMPLETED", hasResult: true, slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1" });
    expect((await buildSlotEditRows([bye, playedDep])).find((r) => r.id === "b")!.canReopenBye).toBe(false);
  });
});

describe("slotDuplicateRefusal", () => {
  const list = () => [
    m({ id: "m1", positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2" }),
    m({ id: "m2", positionInRound: 1 }),
    m({ id: "m3", roundNumber: 2, positionInRound: 0 }),
    m({ id: "m4", roundNumber: 1, positionInRound: 2, isBronzeMatch: true, slotAAthleteId: "a7" }),
  ];

  it("refuses an athlete already paired in another bout of the same round", async () => {
    expect(await slotDuplicateRefusal(list(), "m2", "A", "a1")).toBe("Участник уже стоит в паре этого круга");
    expect(await slotDuplicateRefusal(list(), "m2", "B", "a2")).toBe("Участник уже стоит в паре этого круга");
  });

  it("allows the same slot, other rounds, the other side and the bronze bout", async () => {
    expect(await slotDuplicateRefusal(list(), "m1", "A", "a1")).toBeNull();
    expect(await slotDuplicateRefusal(list(), "m1", "B", "a1")).toBe("Участник уже стоит в паре этого круга");
    expect(await slotDuplicateRefusal(list(), "m3", "A", "a1")).toBeNull();
    expect(await slotDuplicateRefusal(list(), "m2", "A", "a7")).toBeNull();
    expect(await slotDuplicateRefusal(list(), "m2", "A", "a3")).toBeNull();
  });
});

type DbMatch = {
  id: string;
  categoryId: string;
  version: number;
  status: string;
  roundNumber: number;
  positionInRound: number;
  isBronzeMatch: boolean;
  slotAAthleteId: string | null;
  slotBAthleteId: string | null;
  slotAFromMatchId: string | null;
  slotBFromMatchId: string | null;
  winnerAthleteId: string | null;
  result: { id: string } | null;
};

let db: DbMatch[] = [];

const mtch = (over: Partial<DbMatch> = {}): DbMatch => ({
  id: "m",
  categoryId: "cat",
  version: 1,
  status: "PENDING",
  roundNumber: 1,
  positionInRound: 0,
  isBronzeMatch: false,
  slotAAthleteId: null,
  slotBAthleteId: null,
  slotAFromMatchId: null,
  slotBFromMatchId: null,
  winnerAthleteId: null,
  result: null,
  ...over,
});

const targetCat = { id: "cat", eventId: "event", event: { priceTiers: [] } };
const sourceCat = { id: "sourceCat", eventId: "event", mergedIntoId: null, ageGroupLabel: "Юниоры" };

beforeEach(() => {
  vi.clearAllMocks();
  db = [];
  mocks.category.mockResolvedValue(targetCat);
  mocks.authorize.mockResolvedValue({ id: "org" });
  mocks.matchFindUnique.mockImplementation(async ({ where }: { where: { id: string } }) => db.find((x) => x.id === where.id) ?? null);
  mocks.matchFindMany.mockImplementation(async () => db);
  mocks.matchUpdateMany.mockResolvedValue({ count: 1 });
  mocks.matchCount.mockResolvedValue(0);
  mocks.regFindFirst.mockResolvedValue({ id: "reg" });
  mocks.regAggregate.mockResolvedValue({ _max: { seed: 1 }, _count: 5 });
  mocks.regCount.mockResolvedValue(2);
});

describe("setSlot", () => {
  it("writes the slot, bumps the version and audits", async () => {
    db.push(mtch({ id: "m1", version: 3, slotAAthleteId: "a1" }));
    const r = await setSlot("m1", "B", "a2");
    expect(r.ok).toBe(true);
    expect(mocks.matchUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "m1", version: 3 },
      data: { slotBAthleteId: "a2", version: { increment: 1 } },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), {
      actorId: "org",
      action: "bracket.slot",
      entity: "Match",
      entityId: "m1",
      before: { side: "B", athleteId: null },
      after: { side: "B", athleteId: "a2" },
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/organizer/event", "layout");
    expect(mocks.revalidate).toHaveBeenCalledWith("/category/cat");
  });

  it("refuses a slot fed by a pending feeder", async () => {
    db.push(mtch({ id: "m1", positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2" }));
    db.push(mtch({ id: "m5", roundNumber: 2, slotAFromMatchId: "m1" }));
    const r = await setSlot("m5", "A", "a9");
    expect(r).toEqual({ ok: false, msg: "Это место заполнит победитель схватки №1" });
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("refuses an athlete already paired in the same round", async () => {
    db.push(mtch({ id: "m1", positionInRound: 0, slotAAthleteId: "a1", slotBAthleteId: "a2" }));
    db.push(mtch({ id: "m2", positionInRound: 1 }));
    const r = await setSlot("m2", "A", "a1");
    expect(r).toEqual({ ok: false, msg: "Участник уже стоит в паре этого круга" });
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses to touch a played bout", async () => {
    db.push(mtch({ id: "p", status: "COMPLETED", slotAAthleteId: "a1", slotBAthleteId: "a2", winnerAthleteId: "a1", result: { id: "res" } }));
    const r = await setSlot("p", "A", "a3");
    expect(r.ok).toBe(false);
    expect(r.msg).toContain("странице судьи");
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("walkover", () => {
  it("completes the bout without a result and advances the winner", async () => {
    db.push(mtch({ id: "m3", version: 2, slotAAthleteId: "a5" }));
    const r = await walkover("m3");
    expect(r.ok).toBe(true);
    expect(mocks.matchUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "m3", version: 2, status: "PENDING" },
      data: { status: "COMPLETED", winnerAthleteId: "a5", loserAthleteId: null, endedAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(mocks.advance).toHaveBeenCalledExactlyOnceWith(expect.anything(), "m3");
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "bracket.walkover" }));
  });

  it("refuses when the empty slot waits on a pending feeder", async () => {
    db.push(mtch({ id: "m6", roundNumber: 2, slotAAthleteId: "a5", slotBFromMatchId: "m4" }));
    db.push(mtch({ id: "m4", positionInRound: 3 }));
    const r = await walkover("m6");
    expect(r).toEqual({ ok: false, msg: "Это место заполнит победитель схватки №1" });
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });

  it("refuses with zero or two athletes", async () => {
    db.push(mtch({ id: "empty" }));
    expect((await walkover("empty")).ok).toBe(false);
    db.push(mtch({ id: "full", slotAAthleteId: "a1", slotBAthleteId: "a2" }));
    expect((await walkover("full")).ok).toBe(false);
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("reopenBye", () => {
  it("fills the empty slot, reopens the bout and clears dependent slots", async () => {
    db.push(mtch({ id: "b1", status: "COMPLETED", slotAAthleteId: "a1", winnerAthleteId: "a1" }));
    db.push(mtch({ id: "d1", roundNumber: 2, slotAFromMatchId: "b1", slotAAthleteId: "a1" }));
    const r = await reopenBye("b1", "a2");
    expect(r.ok).toBe(true);
    expect(mocks.matchUpdateMany).toHaveBeenCalledExactlyOnceWith({
      where: { id: "b1", version: 1 },
      data: { slotBAthleteId: "a2", status: "PENDING", winnerAthleteId: null, loserAthleteId: null, endedAt: null, version: { increment: 1 } },
    });
    expect(mocks.matchUpdate).toHaveBeenCalledExactlyOnceWith({ where: { id: "d1" }, data: { slotAAthleteId: null } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "bracket.reopenBye" }));
  });

  it("refuses when a dependent bout has a result", async () => {
    db.push(mtch({ id: "b1", status: "COMPLETED", slotAAthleteId: "a1", winnerAthleteId: "a1" }));
    db.push(mtch({ id: "d1", roundNumber: 2, slotAFromMatchId: "b1", slotAAthleteId: "a1", slotBAthleteId: "a2", status: "COMPLETED", winnerAthleteId: "a1", result: { id: "res" } }));
    const r = await reopenBye("b1", "a2");
    expect(r).toEqual({ ok: false, msg: "Нельзя: следующая схватка уже сыграна" });
    expect(mocks.matchUpdateMany).not.toHaveBeenCalled();
    expect(mocks.matchUpdate).not.toHaveBeenCalled();
  });
});

describe("roster guards with played results", () => {
  it("removeFromCategory refuses an athlete occupying a slot", async () => {
    mocks.regFindUnique.mockResolvedValue({ id: "reg1", categoryId: "cat", athleteId: "a1", status: "ADMITTED" });
    mocks.matchCount.mockImplementation(async ({ where }: { where: { OR?: unknown } }) => (where.OR ? 1 : 0));
    const r = await removeFromCategory("reg1");
    expect(r).toEqual({ ok: false, msg: "Сначала замените участника в сетке" });
    expect(mocks.regUpdate).not.toHaveBeenCalled();
  });

  it("moveAthleteHere refuses a slotted athlete from a category with results", async () => {
    mocks.regFindUnique.mockResolvedValue({ id: "regX", categoryId: "sourceCat", athleteId: "a1", category: sourceCat });
    mocks.matchCount.mockResolvedValue(1); // played + occupies the slot
    const r = await moveAthleteHere("cat", "regX");
    expect(r).toEqual({ ok: false, msg: "Сначала замените участника в сетке" });
    expect(mocks.regUpdate).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("moveAthleteHere rebuilds the source bracket when the source has no results", async () => {
    mocks.regFindUnique.mockResolvedValue({ id: "regX", categoryId: "sourceCat", athleteId: "a1", category: sourceCat });
    mocks.matchCount.mockImplementation(async ({ where }: { where: { OR?: unknown; status?: string } }) =>
      where.OR ? 0 : where.status ? 0 : 1, // not slotted, not played, source had matches
    );
    const r = await moveAthleteHere("cat", "regX");
    expect(r.ok).toBe(true);
    expect(mocks.regUpdate).toHaveBeenCalledWith({ where: { id: "regX" }, data: { categoryId: "cat", effectiveCategoryId: "cat", seed: 6 } });
    expect(mocks.build).toHaveBeenCalledExactlyOnceWith("sourceCat");
  });

  it("moveAthleteHere leaves a played source bracket untouched for a free athlete", async () => {
    mocks.regFindUnique.mockResolvedValue({ id: "regX", categoryId: "sourceCat", athleteId: "a1", category: sourceCat });
    mocks.matchCount.mockImplementation(async ({ where }: { where: { OR?: unknown; status?: string } }) =>
      where.OR ? 0 : 1, // not slotted; played and had matches
    );
    const r = await moveAthleteHere("cat", "regX");
    expect(r.ok).toBe(true);
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
