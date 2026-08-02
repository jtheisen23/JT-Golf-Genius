import type { Player, Match, HoleSetup } from '../types';
import type { Tournament } from './types';
import { computePartnerReport, type PartnerReportRow, type PartnerRoundInput } from '../utils/partners';

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
 * Convert a tournament group into a partner-report round input, using the
 * standard Vegas rotations. Net uses full course handicap (getStrokesOnHole and
 * getNetScore share the same stroke logic), so we feed courseHandicap as
 * strokesReceived. Returns null unless the group has exactly 4 players.
 */
export function groupRoundInput(tournament: Tournament, groupId: string): PartnerRoundInput | null {
  const group = tournament.groups.find((g) => g.id === groupId);
  if (!group || group.playerIds.length !== 4) return null;

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
  if (players.length !== 4) return null;

  const holes: HoleSetup[] = tournament.holes.map((h) => ({
    number: h.number,
    par: h.par,
    handicapRating: h.handicapRating,
  }));

  return { players, matches: standardMatches(group.playerIds), holes, scores: tournament.scores[groupId] ?? {} };
}

/** Partner report for a single tournament group (4-player groups only). */
export function tournamentPartnerReport(tournament: Tournament, groupId: string): PartnerReportRow[] {
  const input = groupRoundInput(tournament, groupId);
  return input ? computePartnerReport(input.players, input.matches, input.holes, input.scores, () => 0) : [];
}

/** Every scorable tournament group across the given tournaments, as round inputs. */
export function tournamentGroupsAsRounds(tournaments: Tournament[]): PartnerRoundInput[] {
  const rounds: PartnerRoundInput[] = [];
  for (const t of tournaments) {
    for (const g of t.groups) {
      const input = groupRoundInput(t, g.id);
      if (input) rounds.push(input);
    }
  }
  return rounds;
}
