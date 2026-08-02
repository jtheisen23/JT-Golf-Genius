import { Player, Match, HoleSetup, Multiplier } from '../types';
import { getNetScore, calculateVegasPoints } from './scoring';

export function multiplierValue(m: Multiplier): number {
  switch (m) {
    case 'press':
      return 2;
    case 'roll':
      return 4;
    case 're-roll':
      return 8;
    default:
      return 1;
  }
}

interface VegasState {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>;
  multipliers?: Record<string, Record<number, Multiplier>>;
  pointValue: number;
}

/**
 * Pure Vegas scoring computers matching useRound's getMatch* helpers, so a
 * saved round can render its Scoreboard summary read-only without the hook.
 */
export function makeVegasComputers(state: VegasState) {
  const { players, holes, matches, scores, multipliers = {}, pointValue } = state;

  const getMultiplier = (matchId: string, holeNumber: number): Multiplier =>
    multipliers[matchId]?.[holeNumber] || 'none';

  const getMatchResultsForHole = (match: Match, holeNumber: number) => {
    const hole = holes.find((h) => h.number === holeNumber);
    if (!hole) return null;

    const p1 = players.find((p) => p.id === match.team1[0]);
    const p2 = players.find((p) => p.id === match.team1[1]);
    const p3 = players.find((p) => p.id === match.team2[0]);
    const p4 = players.find((p) => p.id === match.team2[1]);
    if (!p1 || !p2 || !p3 || !p4) return null;

    const g1 = scores[p1.id]?.[holeNumber];
    const g2 = scores[p2.id]?.[holeNumber];
    const g3 = scores[p3.id]?.[holeNumber];
    const g4 = scores[p4.id]?.[holeNumber];
    if (g1 == null || g2 == null || g3 == null || g4 == null) return null;

    const n1 = getNetScore(g1, p1.strokesReceived, hole.handicapRating);
    const n2 = getNetScore(g2, p2.strokesReceived, hole.handicapRating);
    const n3 = getNetScore(g3, p3.strokesReceived, hole.handicapRating);
    const n4 = getNetScore(g4, p4.strokesReceived, hole.handicapRating);

    return calculateVegasPoints([n1, n2], [n3, n4], hole.par, [g1, g2], [g3, g4]);
  };

  const getMatchTotal = (match: Match): number => {
    const startHole = (match.rotation - 1) * 6 + 1;
    const endHole = match.rotation * 6;
    let total = 0;
    for (let h = startHole; h <= endHole; h++) {
      const result = getMatchResultsForHole(match, h);
      if (result) total += result.points * multiplierValue(getMultiplier(match.id, h));
    }
    return total;
  };

  const getPlayerMoney = (playerId: string): number => {
    let totalPoints = 0;
    matches.forEach((match) => {
      const total = getMatchTotal(match);
      if (match.team1.includes(playerId)) totalPoints += total;
      else if (match.team2.includes(playerId)) totalPoints -= total;
    });
    return totalPoints * pointValue;
  };

  return {
    getMultiplier,
    getMultiplierValue: multiplierValue,
    getMatchResultsForHole,
    getMatchTotal,
    getPlayerMoney,
  };
}
