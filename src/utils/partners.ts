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
  overallHoles: number; // holes counted for overallToPar
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
    players.map((p) => [
      p.id,
      { playerId: p.id, pairings: [], carried: 0, leaned: 0, overallToPar: 0, overallHoles: 0 },
    ]),
  );

  // A pair can appear in more than one match of the same rotation — in the
  // 5-player format the anchor pair plays two opponent teams. That's the same
  // partnership over the same holes, so record each (player, partner, rotation)
  // only once.
  const seen = new Set<string>();

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
      const key = `${a}|${b}|${match.rotation}`;
      if (seen.has(key)) return;
      seen.add(key);
      seen.add(`${b}|${a}|${match.rotation}`);

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
    const overall = netToPar(row.playerId, allHoleNums);
    row.overallToPar = overall.toPar;
    row.overallHoles = overall.count;
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

// ---------------------------------------------------------------------------
// Season aggregate: partner stats rolled up across many saved rounds.
// Players are matched by name (round IDs are per-round), so "JT" in one round
// and "JT" in another are the same person.
// ---------------------------------------------------------------------------

export interface SeasonPartnerLink {
  partner: string;
  timesPaired: number;
  carried: number;
  leaned: number;
  even: number;
  myToPar: number; // this player's net to par across shared holes, summed
  theirToPar: number;
}

export interface SeasonPlayer {
  name: string;
  rounds: number;
  carried: number;
  leaned: number;
  even: number;
  netToPar: number;
  holes: number;
  partners: SeasonPartnerLink[];
}

export interface PartnerRoundInput {
  players: Player[];
  matches: Match[];
  holes: HoleSetup[];
  scores: Record<string, Record<number, number>>;
}

const noPoints = () => 0;

// Same guy, different name across rounds — fold aliases into one canonical
// display name for the season roll-up. Keys are lowercase; add pairs here as
// new aliases come up.
const NAME_ALIASES: Record<string, string> = {
  mclovin: 'Mcquillen',
  mcquillen: 'Mcquillen',
  leeroy: 'Lee',
  lee: 'Lee',
  jr: 'Junior',
  junior: 'Junior',
  sr: 'Senior',
  senior: 'Senior',
  johnny: 'Johnny C',
  'johnny c': 'Johnny C',
  shawntay: 'Sean',
  sean: 'Sean',
  g: 'Grant',
  grant: 'Grant',
};

function canonicalName(name: string): string {
  const trimmed = (name || '?').trim();
  return NAME_ALIASES[trimmed.toLowerCase()] ?? trimmed;
}

export function computeSeasonPartners(rounds: PartnerRoundInput[]): SeasonPlayer[] {
  const byName = new Map<string, SeasonPlayer>();

  for (const round of rounds) {
    const report = computePartnerReport(
      round.players ?? [],
      round.matches ?? [],
      round.holes ?? [],
      round.scores ?? {},
      noPoints,
    );
    const nameById = new Map((round.players ?? []).map((p) => [p.id, canonicalName(p.name)]));

    for (const row of report) {
      const name = nameById.get(row.playerId) || '?';
      const key = name.toLowerCase();
      let sp = byName.get(key);
      if (!sp) {
        sp = { name, rounds: 0, carried: 0, leaned: 0, even: 0, netToPar: 0, holes: 0, partners: [] };
        byName.set(key, sp);
      }
      sp.rounds += 1;
      sp.carried += row.carried;
      sp.leaned += row.leaned;
      sp.even += row.pairings.filter((p) => p.outcome === 'even').length;
      sp.netToPar += row.overallToPar;
      sp.holes += row.overallHoles;

      for (const pr of row.pairings) {
        const partnerName = nameById.get(pr.partnerId) || '?';
        const pKey = partnerName.toLowerCase();
        let link = sp.partners.find((l) => l.partner.toLowerCase() === pKey);
        if (!link) {
          link = { partner: partnerName, timesPaired: 0, carried: 0, leaned: 0, even: 0, myToPar: 0, theirToPar: 0 };
          sp.partners.push(link);
        }
        link.timesPaired += 1;
        if (pr.outcome === 'carried') link.carried += 1;
        else if (pr.outcome === 'leaned') link.leaned += 1;
        else link.even += 1;
        link.myToPar += pr.playerToPar;
        link.theirToPar += pr.partnerToPar;
      }
    }
  }

  const players = Array.from(byName.values());
  players.forEach((p) =>
    p.partners.sort(
      (a, b) => b.timesPaired - a.timesPaired || a.myToPar - a.theirToPar - (b.myToPar - b.theirToPar),
    ),
  );
  // Net partner record (carried − leaned) first, then better net scoring.
  players.sort((a, b) => b.carried - b.leaned - (a.carried - a.leaned) || a.netToPar - b.netToPar);
  return players;
}
