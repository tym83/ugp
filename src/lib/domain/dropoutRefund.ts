export type RefundStatus = "NONE" | "TODO" | "DONE";

export const REFUND_LABEL: Record<RefundStatus, string> = { NONE: "не нужен", TODO: "вернуть", DONE: "возвращено" };

export function isRefundStatus(value: unknown): value is RefundStatus {
  return value === "NONE" || value === "TODO" || value === "DONE";
}

export function defaultRefundStatus(paid: boolean, paymentKind: string | null): RefundStatus {
  return paymentKind === "PAID" || (paymentKind === null && paid) ? "TODO" : "NONE";
}

export function parseAuditObject(value: string | null): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(value ?? "null");
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

export function deletedBelongsToEvent(before: string | null, categoryIds: ReadonlySet<string>): boolean {
  const snapshot = parseAuditObject(before);
  return Array.isArray(snapshot.categories) && snapshot.categories.some((id) => typeof id === "string" && categoryIds.has(id));
}

// Input is ordered newest first; invalid historical marks are ignored.
export function latestRefundMarks(marks: { entityId: string | null; after: string | null }[]): Map<string, RefundStatus> {
  const result = new Map<string, RefundStatus>();
  for (const mark of marks) {
    const status = parseAuditObject(mark.after).status;
    if (mark.entityId && !result.has(mark.entityId) && isRefundStatus(status)) result.set(mark.entityId, status);
  }
  return result;
}
