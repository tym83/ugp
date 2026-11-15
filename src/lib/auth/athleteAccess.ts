import { prisma } from "@/lib/prisma";

type AccessUser = { id: string; memberships: { role: string }[] };
type AccessAthlete = { id: string; userId: string | null; coachUserId: string | null };

export type AthleteAccess = { canEdit: boolean; canEditPhone: boolean };

/** Who may edit an athlete profile. Works regardless of event status, so profiles stay
 *  editable after registration closes:
 *  - organizer/admin — everything;
 *  - the athlete's own account, or the account that submitted their entry (a parent) — everything;
 *  - the athlete's coach — everything except the phone (organizers only see it). */
export async function athleteAccess(user: AccessUser, athlete: AccessAthlete): Promise<AthleteAccess> {
  const roles = new Set(user.memberships.map((m) => m.role));
  if (roles.has("ORGANIZER") || roles.has("ADMIN")) return { canEdit: true, canEditPhone: true };

  const ownAccount =
    athlete.userId === user.id ||
    (await prisma.eventEntry.count({ where: { athleteId: athlete.id, submittedByUserId: user.id } })) > 0;
  if (ownAccount) return { canEdit: true, canEditPhone: true };

  if (roles.has("COACH") && athlete.coachUserId === user.id) return { canEdit: true, canEditPhone: false };
  return { canEdit: false, canEditPhone: false };
}
