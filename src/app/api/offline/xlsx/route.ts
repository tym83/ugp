import { NextRequest, NextResponse } from "next/server";
import { buildEventSnapshot } from "@/lib/domain/snapshot";
import { buildBracketWorkbook } from "@/lib/domain/bracketXlsx";
import { organizerEvent } from "../guard";

export const dynamic = "force-dynamic";

// All brackets as an Excel workbook with formulas that advance winners.
export async function GET(req: NextRequest) {
  const ev = await organizerEvent(req.nextUrl.searchParams.get("eventId"));
  if (ev instanceof NextResponse) return ev;
  const snapshot = await buildEventSnapshot(ev.eventId);
  const buf = await buildBracketWorkbook(snapshot);
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="brackets-${stamp}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
