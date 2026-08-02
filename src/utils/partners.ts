import { Player, Match, HoleSetup } from '../types';
import { getNetScore } from './scoring';

export interface PartnerPairing {
  partnerId: string;
  rotation: number;
  holesPlayed: number;
  playerToPar: number; // this player's net score to par over the holes they shared
  partnerToPar: number; // the partner's net to par over the same holes
  teamPoints: number; // team's net Vegas points for the rotation, from this player's side
  outcome: 'carried' | 'leaned' | 'even';
}

export interface PartnerReportRow {
  playerId: string;
  pairings: PartnerPairing[];
  carried: number; // pairings where this player out-scored (net) their partner
  leaned: number; // pairings where the partner out-scored this player
  overallToPar: number; // player's net to par across every hole they scored
}

const outcomeOf = (mine: number, theirs: number): PartnerPairing['outcome'] =>
  mine < theirs ? 'carried' : mine > theirs ? 'leaned' : 'even';

/**
 * Partner report: for each player, how they scored (net to par) alongside each
 * of their partners over the holes they played together, and whether they
 * carried the pairing or leaned on their partner.
 */
export function computePartnerReport(
  players: Player[],
  matches: Match[],
  holes: HoleSetup[],
  scores: Record<string, Record<number, number>>,
  getMatchTotal: (m: Match) => number,
): PartnerReportRow[] {
  const holeByNum = new Map(holes.map((h) => [h.number, h]));
  const strokes = new Map(players.map((p) => [p.id, p.strokesReceived]));

  // Sum of (net − par) for a player over the given holes (only holes they scored;
  // optionally restricted to a shared set so pairings compare the same holes).
  const netToPar = (playerId: string, holeNums: number[], only?: Set<number>) => {
    let toPar = 0;
    let count = 0;
    for (const hn of holeNums) {
      if (only && !only.has(hn)) continue;
      const hole = holeByNum.get(hn);
      const gross = scores[playerId]?.[hn];
      if (!hole || gross == null) continue;
      toPar += getNetScore(gross, strokes.get(playerId) ?? 0, hole.handicapRating) - hole.par;
      count++;
    }
    return { toPar, count };
  };

  const rows = new Map<string, PartnerReportRow>(
    players.map((p) => [p.id, { playerId: p.id, pairings: [], carried: 0, leaned: 0, overallToPar: 0 }]),
  );

  matches.forEach((match) => {
    const start = (match.rotation - 1) * 6 + 1;
    const holeNums = Array.from({ length: 6 }, (_, i) => start + i);
    const total = getMatchTotal(match);
    const teams: { pair: [string, string]; points: number }[] = [
      { pair: match.team1, points: total },
      { pair: match.team2, points: -total },
    ];

    teams.forEach(({ pair, points }) => {
      const [a, b] = pair;
      // Compare over holes where BOTH partners have a score — apples to apples.
      const shared = new Set<number>();
      holeNums.forEach((hn) => {
        if (scores[a]?.[hn] != null && scores[b]?.[hn] != null) shared.add(hn);
      });
      const aStat = netToPar(a, holeNums, shared);
      const bStat = netToPar(b, holeNums, shared);

      rows.get(a)?.pairings.push({
        partnerId: b,
        rotation: match.rotation,
        holesPlayed: aStat.count,
        playerToPar: aStat.toPar,
        partnerToPar: bStat.toPar,
        teamPoints: points,
        outcome: outcomeOf(aStat.toPar, bStat.toPar),
      });
      rows.get(b)?.pairings.push({
        partnerId: a,
        rotation: match.rotation,
        holesPlayed: bStat.count,
        playerToPar: bStat.toPar,
        partnerToPar: aStat.toPar,
        teamPoints: -points,
        outcome: outcomeOf(bStat.toPar, aStat.toPar),
      });
    });
  });

  const allHoleNums = holes.map((h) => h.number);
  rows.forEach((row) => {
    row.overallToPar = netToPar(row.playerId, allHoleNums).toPar;
    row.carried = row.pairings.filter((p) => p.outcome === 'carried').length;
    row.leaned = row.pairings.filter((p) => p.outcome === 'leaned').length;
  });

  // Only players who actually played at least one shared hole.
  return Array.from(rows.values()).filter((r) => r.pairings.some((p) => p.holesPlayed > 0));
}

export function formatToPar(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}
