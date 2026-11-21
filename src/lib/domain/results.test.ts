import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ match: vi.fn(), dependents: vi.fn(), update: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  $transaction: async (run: (tx: unknown) => unknown) => run({
    match: { findUnique: mocks.match, findMany: mocks.dependents, update: mocks.update },
    result: { delete: mocks.remove },
  }),
} }));
vi.mock("./audit", () => ({ appendAudit: mocks.audit }));
vi.mock("./persistBracket", () => ({ advanceWinner: vi.fn() }));

import { undoResult } from "./results";

const match = {
  id: "source", version: 3, status: "COMPLETED", winnerAthleteId: "winner", loserAthleteId: "loser",
  result: { winType: "POINTS", scoreA: 4, scoreB: 2 },
};
const dependent = {
  id: "final", version: 1, status: "PENDING", result: null,
  slotAFromMatchId: "source", slotBFromMatchId: "other", roundNumber: 2, positionInRound: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.match.mockResolvedValue(match);
  mocks.dependents.mockResolvedValue([dependent]);
});

describe("undoResult", () => {
  it.each([null, { ...match, status: "PENDING" }, { ...match, result: null }])("refuses missing results and BYEs", async (value) => {
    mocks.match.mockResolvedValue(value);
    await expect(undoResult({ matchId: "source", actorUserId: "judge" })).rejects.toThrow("Нечего отменять");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each([true, false])("refuses a played winner or loser dependent (%s)", async (slotAWinner) => {
    mocks.dependents.mockResolvedValue([{ ...dependent, status: "COMPLETED", result: {}, slotAWinner }]);
    await expect(undoResult({ matchId: "source", actorUserId: "judge" })).rejects.toThrow("Сначала отмените результат схватки «Круг 2, схватка 1»");
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("removes the result, reopens the bout, clears advancement and audits the previous result", async () => {
    await undoResult({ matchId: "source", actorUserId: "judge", reason: "Ошибка" });
    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith({ where: { matchId: "source" } });
    expect(mocks.update).toHaveBeenNthCalledWith(1, {
      where: { id: "source", version: 3 },
      data: { status: "PENDING", winnerAthleteId: null, loserAthleteId: null, endedAt: null, version: { increment: 1 } },
    });
    expect(mocks.update).toHaveBeenNthCalledWith(2, {
      where: { id: "final", version: 1 },
      data: { slotAAthleteId: null, status: "PENDING", winnerAthleteId: null, loserAthleteId: null, endedAt: null, version: { increment: 1 } },
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), {
      actorId: "judge", action: "RESULT_UNDO", entity: "Match", entityId: "source",
      before: { winner: "winner", loser: "loser", winType: "POINTS", score: [4, 2] },
      after: { reason: "Ошибка" },
    });
  });
});
