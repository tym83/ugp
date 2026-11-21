/** Clear only slots supplied by this feeder, for both winner and loser paths. */
export function clearedResultSlots(
  matchId: string,
  dependent: { slotAFromMatchId: string | null; slotBFromMatchId: string | null },
): { slotAAthleteId?: null; slotBAthleteId?: null } {
  return {
    ...(dependent.slotAFromMatchId === matchId ? { slotAAthleteId: null } : {}),
    ...(dependent.slotBFromMatchId === matchId ? { slotBAthleteId: null } : {}),
  };
}
