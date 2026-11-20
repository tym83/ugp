import { NextRequest, NextResponse } from "next/server";
import { buildEntriesWorkbook } from "@/lib/domain/entriesXlsx";
import { seesFinance } from "@/lib/auth/session";
import { organizerEvent } from "../guard";

export const dynamic = "force-dynamic";

// Entries list as an Excel sheet; fees are left out for users marked HIDE_FINANCE.
export async function GET(req: NextRequest) {
  const ev = await organizerEvent(req.nextUrl.searchParams.get("eventId"));
  if (ev instanceof NextResponse) return ev;
  const buf = await buildEntriesWorkbook(ev.eventId, seesFinance(ev.user, ev.eventId));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="entries-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
