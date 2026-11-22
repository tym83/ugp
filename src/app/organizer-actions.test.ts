import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  entry: vi.fn(), registrations: vi.fn(), update: vi.fn(), played: vi.fn(),
  reg: vi.fn(), event: vi.fn(), category: vi.fn(), categories: vi.fn(), attempt: vi.fn(),
  authorize: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  eventEntry: { findUnique: mocks.entry },
  registration: { findUnique: mocks.reg, update: mocks.update },
  event: { findUnique: mocks.event },
  category: { findUnique: mocks.category, findMany: mocks.categories },
  $transaction: async (run: (tx: unknown) => unknown) => run({
    registration: { findUnique: mocks.reg, findMany: mocks.registrations, update: mocks.update },
    event: { findUnique: mocks.event },
    category: { findUnique: mocks.category },
    weighInAttempt: { create: mocks.attempt },
    match: { count: mocks.played },
  }),
} }));
vi.mock("@/lib/auth/session", () => ({ requireEventRole: mocks.authorize, requireRole: mocks.authorize }));
vi.mock("@/lib/domain/audit", () => ({ appendAudit: mocks.audit }));
vi.mock("@/lib/domain/bracketStatus", () => ({ IN_BRACKET: ["ENTERED", "ADMITTED"] }));
vi.mock("@/lib/domain/eligibility", () => import("../lib/domain/eligibility"));
vi.mock("@/lib/domain/snapshot", () => import("../lib/domain/snapshot"));
vi.mock("@/lib/domain/merge", () => ({}));
vi.mock("@/lib/data/preset", () => ({}));
vi.mock("@/lib/domain/persistBracket", () => ({}));
vi.mock("@/lib/domain/pricing", () => ({}));

import { restoreEntry, restoreRegistration, withdrawEntry, weighInAndAdmit, resolveWeighIn, weighInCategoryOptions } from "./organizer-actions";

const registration = (id: string, status = "ENTERED") => ({
  id, categoryId: id, status, withdrawnAt: null, withdrawReason: null,
  category: { id, ageGroupLabel: "Юниоры", discipline: "gi", sex: "M", level: "beginner", weightMax: 60 },
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.entry.mockResolvedValue({ id: "entry", eventId: "event", paid: true, priceTotal: 2000 });
  mocks.authorize.mockResolvedValue({ id: "organizer" });
  mocks.registrations.mockResolvedValue([registration("open"), registration("played", "ADMITTED")]);
  mocks.played.mockImplementation(async ({ where }) => where.categoryId === "played" ? 1 : 0);
});

describe("entry withdrawal and restoration", () => {
  it("withdraws from every category, including ones with played bouts, and audits the change", async () => {
    const result = await withdrawEntry("entry", "травма");
    expect(mocks.authorize).toHaveBeenCalledWith("event", "ORGANIZER", "ADMIN");
    expect(mocks.registrations).toHaveBeenCalledWith(expect.objectContaining({
      where: { entryId: "entry", status: { in: ["ENTERED", "ADMITTED", "OVERWEIGHT"] } },
    }));
    const data = { status: "WITHDRAWN", withdrawnAt: expect.any(Date), withdrawReason: "entry:травма" };
    expect(mocks.update.mock.calls).toEqual([[{ where: { id: "open" }, data }], [{ where: { id: "played" }, data }]]);
    expect(result.ok).toBe(true);
    expect(result.msg).toContain("неявку");
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "entry.withdraw", after: expect.objectContaining({ registrationIds: ["open", "played"] }),
    }));
    expect(mocks.revalidate.mock.calls).toEqual([["/organizer/event"], ["/category/open"], ["/category/played"]]);
  });

  it("marks default withdrawals", async () => {
    mocks.registrations.mockResolvedValue([registration("bye", "OVERWEIGHT")]);
    await withdrawEntry("entry");
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ withdrawReason: "entry:снят с турнира" }) }));
  });

  it("restores every withdrawn registration regardless of the withdrawal reason", async () => {
    await restoreEntry("entry");
    expect(mocks.registrations).toHaveBeenCalledWith(expect.objectContaining({ where: {
      entryId: "entry", status: "WITHDRAWN",
    } }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "open" }, data: {
      status: "ENTERED", withdrawnAt: null, withdrawReason: null, admittedAt: null,
    } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "entry.restore" }));
  });

  it("restores a single registration withdrawn at weigh-in", async () => {
    mocks.reg.mockResolvedValue({
      id: "reg-w", categoryId: "cat-w", status: "WITHDRAWN",
      withdrawnAt: new Date("2026-11-21T10:00:00Z"), withdrawReason: "перевес на взвешивании",
      category: { id: "cat-w", eventId: "event" },
    });
    const result = await restoreRegistration("reg-w");
    expect(mocks.authorize).toHaveBeenCalledWith("event", "ORGANIZER", "ADMIN");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "reg-w" }, data: {
      status: "ENTERED", withdrawnAt: null, withdrawReason: null, admittedAt: null,
    } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      action: "registration.restore", entityId: "reg-w",
    }));
    expect(mocks.revalidate.mock.calls).toEqual([["/organizer/event"], ["/category/cat-w"]]);
    expect(result).toEqual({ ok: true, msg: "Возвращён" });
  });

  it("refuses to restore a registration that is not withdrawn", async () => {
    mocks.reg.mockResolvedValue({ id: "reg-a", categoryId: "cat", status: "ADMITTED", category: { id: "cat", eventId: "event" } });
    expect((await restoreRegistration("reg-a")).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not mutate anything when event authorization fails", async () => {
    mocks.authorize.mockRejectedValueOnce(new Error("Forbidden"));
    await expect(withdrawEntry("entry")).rejects.toThrow("Forbidden");
    expect(mocks.registrations).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("handles missing entries and repeated calls without registrations", async () => {
    mocks.entry.mockResolvedValueOnce(null);
    expect((await withdrawEntry("missing")).ok).toBe(false);
    mocks.registrations.mockResolvedValueOnce([]);
    expect((await restoreEntry("entry")).msg).toBe("Нет регистраций для изменения");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});

const weighCategory = (id = "source", weightMin = 27, weightMax = 30) => ({
  id, eventId: "event", discipline: "gi", sex: "M", level: "beginner",
  ageGroupLabel: "Дети", birthYearFrom: 2015, birthYearTo: 2016,
  weightMin, weightMax, isOpenTop: false, isAbsolute: false,
  mergedIntoId: null, bracketVersion: 0,
});

describe("explicit weigh-in decisions", () => {
  beforeEach(() => {
    mocks.reg.mockResolvedValue({
      id: "reg", categoryId: "source", effectiveCategoryId: null, status: "ENTERED",
      actualWeight: 30.2, weighedAt: new Date(), admittedAt: null, withdrawnAt: null, withdrawReason: null,
      category: weighCategory(), athlete: { sex: "M", birthDate: new Date("2015-01-01") },
    });
    mocks.event.mockResolvedValue({ status: "REG_CLOSED" });
    mocks.categories.mockResolvedValue([weighCategory("heavier", 30, 33)]);
    mocks.category.mockResolvedValue(weighCategory("heavier", 30, 33));
    mocks.played.mockResolvedValue(0);
  });

  it("records a fitting weight and admits in the same category", async () => {
    expect((await weighInAndAdmit("reg", 30)).status).toBe("ADMITTED");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "reg" }, data: {
      actualWeight: 30, weighedAt: expect.any(Date), status: "ADMITTED", admittedAt: expect.any(Date), effectiveCategoryId: "source",
    } });
    expect(mocks.attempt).toHaveBeenCalledWith({ data: { registrationId: "reg", weight: 30, ok: true } });
  });

  it("suggests a heavier category without changing category or status", async () => {
    const result = await weighInAndAdmit("reg", 30.2);
    expect(result).toMatchObject({ ok: false, status: "NEEDS_DECISION", suggestion: { categoryId: "heavier" } });
    expect(result.msg).toBe("Перевес: 30.2 кг при лимите до 30 кг");
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "reg" }, data: { actualWeight: 30.2, weighedAt: expect.any(Date) } });
    expect(mocks.attempt).toHaveBeenCalledWith({ data: { registrationId: "reg", weight: 30.2, ok: false } });
    expect(mocks.categories).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({
      eventId: "event", discipline: "gi", sex: "M", level: "beginner", isAbsolute: false, mergedIntoId: null, id: { not: "source" },
    }) }));
  });

  it("suggests the nearest lighter category, including at the exclusive minimum", async () => {
    mocks.categories.mockResolvedValue([weighCategory("far", 20, 26), weighCategory("near", 24, 27)]);
    expect(await weighInAndAdmit("reg", 25)).toMatchObject({ status: "NEEDS_DECISION", suggestion: { categoryId: "near" } });
    expect(await weighInAndAdmit("reg", 27)).toMatchObject({ status: "NEEDS_DECISION", msg: "Недовес: 27 кг, категория свыше 27 кг", suggestion: { categoryId: "near" } });
  });

  it("returns no suggestion when no eligible category fits", async () => {
    mocks.categories.mockResolvedValue([weighCategory("wrong-age", 35, 40)]);
    expect(await weighInAndAdmit("reg", 31)).toMatchObject({ status: "NEEDS_DECISION", suggestion: null });
  });

  it.each(["KEEP", "MOVE", "WITHDRAW"] as const)("applies and audits %s", async (decision) => {
    const result = await resolveWeighIn("reg", decision, "heavier");
    expect(result.ok).toBe(true);
    const data = decision === "WITHDRAW"
      ? { status: "WITHDRAWN", withdrawnAt: expect.any(Date), withdrawReason: "перевес на взвешивании" }
      : { status: "ADMITTED", admittedAt: expect.any(Date), categoryId: decision === "MOVE" ? "heavier" : "source", effectiveCategoryId: decision === "MOVE" ? "heavier" : "source" };
    expect(mocks.update).toHaveBeenCalledExactlyOnceWith({ where: { id: "reg" }, data });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "organizer", action: "weighin.decision", entityId: "reg",
      before: expect.objectContaining({ status: "ENTERED", categoryId: "source" }), after: { decision, ...data },
    }));
    expect(mocks.revalidate).toHaveBeenCalledWith("/organizer/event");
    expect(mocks.revalidate).toHaveBeenCalledWith("/category/source");
    if (decision === "MOVE") expect(mocks.revalidate).toHaveBeenCalledWith("/category/heavier");
  });

  it("warns about both existing brackets without rebuilding", async () => {
    mocks.played.mockImplementation(async ({ where }) => where.result ? 0 : 2);
    const result = await resolveWeighIn("reg", "MOVE", "heavier");
    expect(result.ok).toBe(true);
    expect(result.msg.match(/пересоберите её/g)).toHaveLength(2);
  });

  it("rejects a move when either category has results", async () => {
    mocks.played.mockResolvedValue(1);
    expect((await resolveWeighIn("reg", "MOVE", "heavier")).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it.each([{ eventId: "other" }, { discipline: "nogi" }, { mergedIntoId: "merged" }])("rejects an invalid destination %j", async (patch) => {
    mocks.category.mockResolvedValue({ ...weighCategory("heavier"), ...patch });
    expect((await resolveWeighIn("reg", "MOVE", "heavier")).ok).toBe(false);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("respects the lock for weighing and all decisions", async () => {
    mocks.event.mockResolvedValue({ status: "LIVE" });
    expect((await weighInAndAdmit("reg", 29)).ok).toBe(false);
    for (const decision of ["KEEP", "MOVE", "WITHDRAW"] as const) {
      expect((await resolveWeighIn("reg", decision, "heavier")).ok).toBe(false);
    }
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.attempt).not.toHaveBeenCalled();
  });

  it("loads manual choices for this event and discipline only", async () => {
    expect(await weighInCategoryOptions("reg")).toEqual([{ categoryId: "heavier", label: expect.any(String) }]);
    expect(mocks.categories).toHaveBeenCalledWith({ where: {
      eventId: "event", discipline: "gi", mergedIntoId: null, id: { not: "source" },
    }, orderBy: { order: "asc" } });
  });
});
