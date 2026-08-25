import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isMinor, maskName } from "@/lib/privacy";

export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  if (!categoryId) return NextResponse.json({ error: "categoryId required" }, { status: 400 });
  const regs = await prisma.registration.findMany({ where: { categoryId, status: "ADMITTED" }, include: { athlete: true } });
  const name = new Map(
    regs.map((r) => [r.athleteId, maskName(r.athlete.fullName, isMinor(r.athlete.birthDate))]),
  );
  const matches = await prisma.match.findMany({ where: { categoryId }, orderBy: [{ roundNumber: "asc" }, { positionInRound: "asc" }] });
  return NextResponse.json(
    matches.map((m) => ({
      id: m.id,
      round: m.roundNumber,
      pos: m.positionInRound,
      bronze: m.isBronzeMatch,
      status: m.status,
      a: m.slotAAthleteId ? { id: m.slotAAthleteId, name: name.get(m.slotAAthleteId) } : null,
      b: m.slotBAthleteId ? { id: m.slotBAthleteId, name: name.get(m.slotBAthleteId) } : null,
      winner: m.winnerAthleteId ? { id: m.winnerAthleteId, name: name.get(m.winnerAthleteId) } : null,
    }))
  );
}
