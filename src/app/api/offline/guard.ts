import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireEventRole } from "@/lib/auth/session";

/** Resolve the event (by slug or id) and require an organizer of it. */
export async function organizerEvent(eventParam: string | null): Promise<{ eventId: string } | NextResponse> {
  if (!eventParam) return NextResponse.json({ error: "eventId required" }, { status: 400 });
  const event = await prisma.event.findFirst({ where: { OR: [{ slug: eventParam }, { id: eventParam }] } });
  if (!event) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    await requireEventRole(event.id, "ORGANIZER", "ADMIN");
  } catch {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return { eventId: event.id };
}
