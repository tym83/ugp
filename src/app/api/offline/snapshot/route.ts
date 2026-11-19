import { NextRequest, NextResponse } from "next/server";
import { buildEventSnapshot } from "@/lib/domain/snapshot";
import { organizerEvent } from "../guard";

export const dynamic = "force-dynamic";

// Snapshot of every generated bracket of the event — feeds the offline organizer console.
export async function GET(req: NextRequest) {
  const ev = await organizerEvent(req.nextUrl.searchParams.get("eventId"));
  if (ev instanceof NextResponse) return ev;
  return NextResponse.json(await buildEventSnapshot(ev.eventId), { headers: { "Cache-Control": "no-store" } });
}
