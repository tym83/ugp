import { prisma } from "@/lib/prisma";
import { defaultRefundStatus, deletedBelongsToEvent, latestRefundMarks, parseAuditObject, type RefundStatus } from "./dropoutRefund";

export type Dropout = {
  entryId: string;
  kind: "withdrawn" | "deleted";
  athleteId: string | null;
  /** Категория последней снятой регистрации — предвыбор в селекте возврата. */
  categoryId: string | null;
  fullName: string;
  birthDate: Date | null;
  club: string | null;
  phone: string | null;
  priceTotal: number;
  paid: boolean;
  paymentKind: string | null;
  at: Date | null;
  by: string | null;
  reason: string | null;
  refund: RefundStatus;
};

function text(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function date(value: unknown): Date | null {
  const parsed = typeof value === "string" ? new Date(value) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

export async function listDropouts(eventId: string): Promise<Dropout[]> {
  const [entries, categories, deletions] = await Promise.all([
    prisma.eventEntry.findMany({
      where: { eventId, registrations: { some: {}, every: { status: "WITHDRAWN" } } },
      include: { athlete: { include: { club: true } }, registrations: { orderBy: { withdrawnAt: "desc" } } },
    }),
    prisma.category.findMany({ where: { eventId }, select: { id: true } }),
    prisma.auditLog.findMany({ where: { action: "entry.delete", entity: "EventEntry" }, include: { actor: { select: { email: true } } }, orderBy: [{ ts: "desc" }, { id: "desc" }] }),
  ]);
  const categoryIds = new Set(categories.map((c) => c.id));
  const deleted = deletions.filter((log) => log.entityId && deletedBelongsToEvent(log.before, categoryIds));
  const ids = [...entries.map((e) => e.id), ...deleted.map((log) => log.entityId!)];
  const [marks, withdrawals] = await Promise.all([
    prisma.auditLog.findMany({ where: { action: "refund.mark", entity: "EventEntry", entityId: { in: ids } }, orderBy: [{ ts: "desc" }, { id: "desc" }] }),
    prisma.auditLog.findMany({
      where: { OR: [
        { action: "entry.withdraw", entity: "EventEntry", entityId: { in: entries.map((e) => e.id) } },
        { action: "roster.remove", entity: "Registration", entityId: { in: entries.flatMap((e) => e.registrations.map((r) => r.id)) } },
      ] },
      include: { actor: { select: { email: true } } }, orderBy: [{ ts: "desc" }, { id: "desc" }],
    }),
  ]);
  const refunds = latestRefundMarks(marks);
  const rows: Dropout[] = entries.map((entry) => {
    const latest = entry.registrations.find((r) => r.withdrawnAt) ?? entry.registrations[0];
    const audit = withdrawals.find((log) => {
      if (log.entity === "Registration") return log.entityId === latest.id;
      const after = parseAuditObject(log.after);
      return log.entityId === entry.id && Array.isArray(after.registrationIds) && after.registrationIds.includes(latest.id);
    });
    return {
      entryId: entry.id, kind: "withdrawn", athleteId: entry.athlete.id, categoryId: latest.categoryId,
      fullName: entry.athlete.fullName,
      birthDate: entry.athlete.birthDate, club: entry.athlete.club?.name ?? null, phone: entry.athlete.phone,
      priceTotal: entry.priceTotal, paid: entry.paid, paymentKind: entry.paymentKind,
      at: latest.withdrawnAt, by: audit?.actor?.email ?? null,
      reason: latest.withdrawReason?.replace(/^entry:/, "") ?? null,
      refund: refunds.get(entry.id) ?? defaultRefundStatus(entry.paid, entry.paymentKind),
    };
  });
  const seen = new Set(rows.map((r) => r.entryId));
  for (const log of deleted) {
    const entryId = log.entityId!;
    if (seen.has(entryId)) continue;
    seen.add(entryId);
    const before = parseAuditObject(log.before);
    const paid = before.paid === true;
    const paymentKind = text(before.paymentKind);
    rows.push({
      entryId, kind: "deleted", athleteId: null, categoryId: null,
      fullName: text(before.athlete) ?? "—",
      birthDate: date(before.birthDate), club: text(before.club), phone: text(before.phone),
      priceTotal: typeof before.priceTotal === "number" ? before.priceTotal : 0,
      paid, paymentKind, at: log.ts, by: log.actor?.email ?? null, reason: text(before.reason),
      refund: refunds.get(entryId) ?? defaultRefundStatus(paid, paymentKind),
    });
  }
  return rows.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.entryId.localeCompare(b.entryId));
}
