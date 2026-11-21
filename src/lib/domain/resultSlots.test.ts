import { describe, expect, it } from "vitest";
import { clearedResultSlots } from "./resultSlots";

describe("clearedResultSlots", () => {
  it.each([
    ["source", "other", { slotAAthleteId: null }],
    ["other", "source", { slotBAthleteId: null }],
    ["source", "source", { slotAAthleteId: null, slotBAthleteId: null }],
    [null, "other", {}],
  ])("clears only matching feeder slots (%s, %s)", (slotAFromMatchId, slotBFromMatchId, expected) => {
    expect(clearedResultSlots("source", { slotAFromMatchId, slotBFromMatchId })).toEqual(expected);
  });

  it.each([true, false])("clears advancement regardless of winner/loser routing (%s)", (slotAWinner) => {
    const dependent = { slotAFromMatchId: "source", slotBFromMatchId: "other", slotAWinner, slotAAthleteId: "advanced", slotBAthleteId: "unrelated" };
    expect({ ...dependent, ...clearedResultSlots("source", dependent) }).toEqual({ ...dependent, slotAAthleteId: null });
  });
});
