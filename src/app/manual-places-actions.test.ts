import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ category: vi.fn(), current: vi.fn(), update: vi.fn(), authorize: vi.fn(), audit: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  category: { findUnique: mocks.category },
  $transaction: async (run: (tx: unknown) => unknown) => run({ category: { findUniqueOrThrow: mocks.current, update: mocks.update } }),
} }));
vi.mock("@/lib/auth/session", () => ({ requireEventRole: mocks.authorize }));
vi.mock("@/lib/domain/audit", () => ({ appendAudit: mocks.audit }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import { setManualPlaces } from "./manual-places-actions";

const category = { id: "cat", slug: "slug", eventId: "event", bracketType: "ROUND_ROBIN", placesOverride: null, matches: [
  { slotAAthleteId: "a", slotBAthleteId: "b", status: "COMPLETED", isRoundRobin: true },
  { slotAAthleteId: "a", slotBAthleteId: "c", status: "COMPLETED", isRoundRobin: true },
  { slotAAthleteId: "b", slotBAthleteId: "c", status: "COMPLETED", isRoundRobin: true },
] };
beforeEach(() => {
  vi.resetAllMocks();
  mocks.category.mockResolvedValue(category);
  mocks.current.mockResolvedValue(category);
  mocks.authorize.mockResolvedValue({ id: "judge" });
});
describe("manual places", () => {
  it("authorizes the event, saves and audits the order, and refreshes pages", async () => {
    await setManualPlaces("cat", ["c", "a", "b"]);
    expect(mocks.authorize).toHaveBeenCalledWith("event", "ORGANIZER", "ADMIN");
    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "cat" }, data: { placesOverride: '["c","a","b"]' } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "places.manual", actorId: "judge" }));
    for (const path of ["/category/cat", "/judge/cat", "/standings/event", "/category/slug", "/judge/slug"]) expect(mocks.revalidate).toHaveBeenCalledWith(path);
  });
  it.each([["a", "a", "b"], ["a", "b", "outsider"], ["a", "b"], ["a", "b", "c", "d"]])("refuses invalid ids %j", async (...ids) => {
    await expect(setManualPlaces("cat", ids)).rejects.toThrow("ровно один раз");
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("refuses incomplete bouts and elimination categories", async () => {
    for (const current of [{ ...category, bracketType: "SINGLE_ELIM" }, { ...category, matches: category.matches.slice(1) }, { ...category, matches: category.matches.map((m) => ({ ...m, status: "PENDING" })) }]) {
      mocks.current.mockResolvedValue(current);
      await expect(setManualPlaces("cat", ["a", "b", "c"])).rejects.toThrow("три схватки");
    }
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("does not write if authorization fails", async () => {
    mocks.authorize.mockRejectedValue(new Error("Недостаточно прав"));
    await expect(setManualPlaces("cat", ["a", "b", "c"])).rejects.toThrow("Недостаточно прав");
    expect(mocks.current).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
