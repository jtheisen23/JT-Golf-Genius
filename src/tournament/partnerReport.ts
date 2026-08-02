import type { Player, Match, HoleSetup } from '../types';
import type { Tournament } from './types';
import { computePartnerReport, type PartnerReportRow } from '../utils/partners';

// Standard 3-rotation partnerships for a 4-player group (holes 1-6 / 7-12 / 13-18).
function standardMatches(ids: string[]): Match[] {
  if (ids.length !== 4) return [];
  const [a, b, c, d] = ids;
  return [
    { id: 'r1', team1: [a, b], team2: [c, d], rotation: 1 },
    { id: 'r2', team1: [a, c], team2: [b, d], rotation: 2 },
    { id: 'r3', team1: [a, d], team2: [b, c], rotation: 3 },
  ];
}

/**
 * Partner report for a tournament group from its stroke-play scores, using the
 * standard Vegas rotations. Net uses full course handicap (getStrokesOnHole and
 * getNetScore share the same stroke logic), so we feed courseHandicap as
 * strokesReceived. Requires a 4-player group.
 */
export function tournamentPartnerReport(tournament: Tournament, groupId: string): PartnerReportRow[] {
  const group = tournament.groups.find((g) => g.id === groupId);
  if (!group || group.playerIds.length !== 4) return [];

  const players: Player[] = group.playerIds
    .map((id) => tournament.players[id])
    .filter(Boolean)
    .map((p) => ({
      id: p.id,
      name: p.name,
      handicapIndex: p.handicapIndex,
      handicap: p.courseHandicap,
      strokesReceived: p.courseHandicap,
    }));
  if (players.length !== 4) return [];

  const holes: HoleSetup[] = tournament.holes.map((h) => ({
    number: h.number,
    par: h.par,
    handicapRating: h.handicapRating,
  }));

  return computePartnerReport(players, standardMatches(group.playerIds), holes, tournament.scores[groupId] ?? {}, () => 0);
}
