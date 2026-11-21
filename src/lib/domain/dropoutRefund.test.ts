import { describe, expect, it } from "vitest";
import { defaultRefundStatus, deletedBelongsToEvent, isRefundStatus, latestRefundMarks } from "./dropoutRefund";

describe("defaultRefundStatus", () => {
  it.each([
    [true, null, "TODO"], [false, null, "NONE"], [true, "PAID", "TODO"],
    [false, "PAID", "TODO"], [true, "FREE", "NONE"], [true, "LATER", "NONE"],
  ])("handles paid=%s and kind=%s", (paid, kind, expected) => {
    expect(defaultRefundStatus(paid as boolean, kind as string | null)).toBe(expected);
  });
});

describe("deletedBelongsToEvent", () => {
  const ids = new Set(["event-category"]);
  it("matches any category, including merged event categories", () => {
    expect(deletedBelongsToEvent(JSON.stringify({ categories: ["other", "event-category"] }), ids)).toBe(true);
  });
  it.each([null, "invalid", "[]", "null", "{}", '{"categories":[]}', '{"categories":["other"]}', '{"categories":"event-category"}'])("rejects unidentifiable or foreign snapshot %s", (snapshot) => {
    expect(deletedBelongsToEvent(snapshot, ids)).toBe(false);
  });
});

describe("refund marks", () => {
  it("uses the newest valid mark per entry, including explicit NONE", () => {
    expect(latestRefundMarks([
      { entityId: "a", after: '{"status":"NONE"}' },
      { entityId: "a", after: '{"status":"DONE"}' },
      { entityId: "b", after: '{"status":"INVALID"}' },
      { entityId: "b", after: '{"status":"TODO"}' },
      { entityId: null, after: '{"status":"DONE"}' },
    ])).toEqual(new Map([["a", "NONE"], ["b", "TODO"]]));
  });
  it.each([null, "", "PAID", {}, 0])("rejects invalid status %s", (value) => {
    expect(isRefundStatus(value)).toBe(false);
  });
});
