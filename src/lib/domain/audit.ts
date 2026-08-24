import { createHash } from "crypto";
import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

/** Append-only аудит с hash-chain (целостность). */
export async function appendAudit(
  tx: Tx,
  entry: { actorId?: string | null; action: string; entity: string; entityId?: string | null; before?: unknown; after?: unknown }
) {
  const last = await tx.auditLog.findFirst({ orderBy: { ts: "desc" } });
  const prevHash = last?.hash ?? null;
  const beforeStr = entry.before != null ? JSON.stringify(entry.before) : null;
  const afterStr = entry.after != null ? JSON.stringify(entry.after) : null;
  const payload = JSON.stringify({
    actorId: entry.actorId ?? null,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    before: beforeStr,
    after: afterStr,
    prevHash,
  });
  const hash = createHash("sha256").update((prevHash ?? "") + payload).digest("hex");
  await tx.auditLog.create({
    data: { actorId: entry.actorId ?? null, action: entry.action, entity: entry.entity, entityId: entry.entityId ?? null, before: beforeStr, after: afterStr, prevHash, hash },
  });
}
