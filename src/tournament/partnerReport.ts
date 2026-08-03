import type { Player, Match, HoleSetup, SavedRound } from '../types';
import type { Tournament, TourGroup } from './types';
import { computePartnerReport, type PartnerReportRow, type PartnerRoundInput } from '../utils/partners';

// Rotation partnerships for a 4- or 5-player group, matching the Vegas
// auto-generator (holes 1-6 / 7-12 / 13-18). For 5 players the anchor pair
// plays a second opponent team each rotation so the 5th rotates in.
function generateMatches(ids: string[]): Match[] {
  if (ids.length < 4 || ids.length > 5) return [];
  const p = ids;
  const matches: Match[] = [
    { id: 'r1', team1: [p[0], p[1]], team2: [p[2], p[3]], rotation: 1 },
    { id: 'r2', team1: [p[0], p[2]], team2: [p[1], p[3]], rotation: 2 },
    { id: 'r3', team1: [p[0], p[3]], team2: [p[1], p[2]], rotation: 3 },
  ];
  if (ids.length === 5) {
    matches.push(
      { id: 'r1b', team1: [p[0], p[1]], team2: [p[4], p[2]], rotation: 1 },
      { id: 'r2b', team1: [p[0], p[2]], team2: [p[4], p[3]], rotation: 2 },
      { id: 'r3b', team1: [p[0], p[3]], team2: [p[4], p[1]], rotation: 3 },
    );
  }
  return matches;
}

/**
 * Convert a tournament group into a partner-report round input, using the
 * standard Vegas rotations. Net uses full course handicap (getStrokesOnHole and
 * getNetScore share the same stroke logic), so we feed courseHandicap as
 * strokesReceived. Returns null unless the group has exactly 4 players.
 */
export function groupRoundInput(tournament: Tournament, groupId: string): PartnerRoundInput | null {
  const group = tournament.groups.find((g) => g.id === groupId);
  if (!group || group.playerIds.length < 4 || group.playerIds.length > 5) return null;

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
  if (players.length < 4 || players.length > 5) return null;

  const holes: HoleSetup[] = tournament.holes.map((h) => ({
    number: h.number,
    par: h.par,
    handicapRating: h.handicapRating,
  }));

  return {
    players,
    matches: generateMatches(players.map((p) => p.id)),
    holes,
    scores: tournament.scores[groupId] ?? {},
  };
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

function hasAnyScore(scores: Record<string, Record<number, number>>): boolean {
  return Object.values(scores).some((holes) => Object.keys(holes).length > 0);
}

/**
 * A tournament group presented as a Vegas SavedRound so it can appear in the
 * combined Past Rounds directory and open the read-only Round Summary. Returns
 * null for non-4-player groups or groups with no scores entered. No real Vegas
 * stake exists on the tournament side, so the point value defaults to 0.50.
 */
export function tournamentGroupSavedRound(t: Tournament, group: TourGroup): SavedRound | null {
  const input = groupRoundInput(t, group.id);
  if (!input || !hasAnyScore(input.scores)) return null;
  return {
    id: `t-${t.id}-${group.id}`,
    date: t.date,
    courseName: `${t.courseName} — ${group.name}`,
    players: input.players,
    holes: input.holes,
    matches: input.matches,
    scores: input.scores,
    pointsPerDollar: 0.5,
    slope: t.slope,
    courseRating: t.courseRating,
    results: [],
    multipliers: {},
  };
}
