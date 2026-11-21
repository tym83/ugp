import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  entry: vi.fn(), registrations: vi.fn(), update: vi.fn(), played: vi.fn(),
  authorize: vi.fn(), audit: vi.fn(), revalidate: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  eventEntry: { findUnique: mocks.entry },
  $transaction: async (run: (tx: unknown) => unknown) => run({
    registration: { findMany: mocks.registrations, update: mocks.update },
    match: { count: mocks.played },
  }),
} }));
vi.mock("@/lib/auth/session", () => ({ requireEventRole: mocks.authorize }));
vi.mock("@/lib/domain/audit", () => ({ appendAudit: mocks.audit }));
vi.mock("@/lib/domain/bracketStatus", () => ({ IN_BRACKET: ["ENTERED", "ADMITTED"] }));
vi.mock("@/lib/domain/eligibility", () => ({}));
vi.mock("@/lib/domain/merge", () => ({}));
vi.mock("@/lib/data/preset", () => ({}));
vi.mock("@/lib/domain/persistBracket", () => ({}));
vi.mock("@/lib/domain/pricing", () => ({}));

import { restoreEntry, withdrawEntry } from "./organizer-actions";

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

  it("restores only tournament withdrawals", async () => {
    await restoreEntry("entry");
    expect(mocks.registrations).toHaveBeenCalledWith(expect.objectContaining({ where: {
      entryId: "entry", status: "WITHDRAWN",
      OR: [{ withdrawReason: "снят с турнира" }, { withdrawReason: { startsWith: "entry:" } }],
    } }));
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "open" }, data: {
      status: "ENTERED", withdrawnAt: null, withdrawReason: null, admittedAt: null,
    } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "entry.restore" }));
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
