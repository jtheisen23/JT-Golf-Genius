import { Player, Match, HoleSetup, Multiplier } from '../types';
import { getNetScore } from './scoring';
import { makeVegasComputers } from './vegasCompute';

export interface PartnerPairing {
  partnerId: string;
  rotation: number;
  holesPlayed: number;
  holesWon: number; // holes where this player had the lower net (hole-by-hole)
  holesLost: number; // holes where the partner had the lower net
  playerToPar: number; // this player's net score to par over the holes they shared
  partnerToPar: number; // the partner's net to par over the same holes
  teamPoints: number; // team's net Vegas points for the rotation, from this player's side
  outcome: 'carried' | 'leaned' | 'even';
}

export interface PartnerReportRow {
  playerId: string;
  pairings: PartnerPairing[];
  carried: number; // pairings where this player won more holes than their partner
  leaned: number; // pairings where the partner won more holes
  holesWon: number; // total holes out-scored across all pairings
  holesLost: number; // total holes the partner out-scored
  overallToPar: number; // player's net to par across every hole they scored
  overallHoles: number; // holes counted for overallToPar
}

const outcomeOf = (mine: number, theirs: number): PartnerPairing['outcome'] =>
  mine > theirs ? 'carried' : mine < theirs ? 'leaned' : 'even';

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

  // Hole-by-hole net comparison for a pair over their shared holes — who had the
  // lower net on each hole. This is the Vegas view: each hole its own contest,
  // immune to a single blow-up. Returns wins for `a` (losses = wins for `b`).
  const holeWins = (a: string, b: string, shared: Set<number>) => {
    let aWon = 0;
    let bWon = 0;
    shared.forEach((hn) => {
      const hole = holeByNum.get(hn);
      if (!hole) return;
      const na = getNetScore(scores[a][hn], strokes.get(a) ?? 0, hole.handicapRating);
      const nb = getNetScore(scores[b][hn], strokes.get(b) ?? 0, hole.handicapRating);
      if (na < nb) aWon++;
      else if (nb < na) bWon++;
    });
    return { aWon, bWon };
  };

  const rows = new Map<string, PartnerReportRow>(
    players.map((p) => [
      p.id,
      {
        playerId: p.id,
        pairings: [],
        carried: 0,
        leaned: 0,
        holesWon: 0,
        holesLost: 0,
        overallToPar: 0,
        overallHoles: 0,
      },
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
      const { aWon, bWon } = holeWins(a, b, shared);

      rows.get(a)?.pairings.push({
        partnerId: b,
        rotation: match.rotation,
        holesPlayed: aStat.count,
        holesWon: aWon,
        holesLost: bWon,
        playerToPar: aStat.toPar,
        partnerToPar: bStat.toPar,
        teamPoints: points,
        outcome: outcomeOf(aWon, bWon),
      });
      rows.get(b)?.pairings.push({
        partnerId: a,
        rotation: match.rotation,
        holesPlayed: bStat.count,
        holesWon: bWon,
        holesLost: aWon,
        playerToPar: bStat.toPar,
        partnerToPar: aStat.toPar,
        teamPoints: -points,
        outcome: outcomeOf(bWon, aWon),
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
    row.holesWon = row.pairings.reduce((s, p) => s + p.holesWon, 0);
    row.holesLost = row.pairings.reduce((s, p) => s + p.holesLost, 0);
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
  mitch: 'Mitchell',
  mitchell: 'Mitchell',
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

// ---------------------------------------------------------------------------
// Season money: cumulative money won and lost per player across all rounds.
// Money is tallied per match (each match is a bet won or lost).
// ---------------------------------------------------------------------------

export interface SeasonMoney {
  name: string;
  won: number; // gross money won across all matches
  lost: number; // gross money lost (positive number)
  net: number; // won − lost
  rounds: number;
}

interface MoneyRoundInput {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>;
  multipliers?: Record<string, Record<number, Multiplier>>;
  pointsPerDollar: number;
}

export function computeSeasonMoney(rounds: MoneyRoundInput[]): SeasonMoney[] {
  const byName = new Map<string, SeasonMoney>();

  for (const round of rounds) {
    const { getMatchTotal } = makeVegasComputers({
      players: round.players ?? [],
      holes: round.holes ?? [],
      matches: round.matches ?? [],
      scores: round.scores ?? {},
      multipliers: round.multipliers,
      pointValue: round.pointsPerDollar,
    });
    const totals = new Map((round.matches ?? []).map((m) => [m.id, getMatchTotal(m)]));
    const countedThisRound = new Set<string>();

    for (const p of round.players ?? []) {
      let won = 0;
      let lost = 0;
      for (const match of round.matches ?? []) {
        const onT1 = match.team1.includes(p.id);
        const onT2 = match.team2.includes(p.id);
        if (!onT1 && !onT2) continue;
        const money = (onT1 ? 1 : -1) * (totals.get(match.id) ?? 0) * round.pointsPerDollar;
        if (money > 0) won += money;
        else if (money < 0) lost += -money;
      }
      if (won === 0 && lost === 0) continue;

      const name = canonicalName(p.name);
      const key = name.toLowerCase();
      let sm = byName.get(key);
      if (!sm) {
        sm = { name, won: 0, lost: 0, net: 0, rounds: 0 };
        byName.set(key, sm);
      }
      sm.won += won;
      sm.lost += lost;
      sm.net += won - lost;
      if (!countedThisRound.has(key)) {
        sm.rounds += 1;
        countedThisRound.add(key);
      }
    }
  }

  return Array.from(byName.values()).sort((a, b) => b.net - a.net);
}

// ---------------------------------------------------------------------------
// Birdie money share: of all the money that swung, what fraction moved on
// holes where someone made a gross birdie (or better) — the Vegas flip trigger.
// ---------------------------------------------------------------------------

export interface BirdieMoneyShare {
  birdieMoney: number; // money that moved on gross-birdie holes
  totalMoney: number; // total money that moved (both directions counted once)
  pct: number;
}

export function computeBirdieMoneyShare(rounds: MoneyRoundInput[]): BirdieMoneyShare {
  let birdieMoney = 0;
  let totalMoney = 0;

  for (const round of rounds) {
    const parByHole = new Map((round.holes ?? []).map((h) => [h.number, h.par]));
    const { getMatchResultsForHole, getMultiplier, getMultiplierValue } = makeVegasComputers({
      players: round.players ?? [],
      holes: round.holes ?? [],
      matches: round.matches ?? [],
      scores: round.scores ?? {},
      multipliers: round.multipliers,
      pointValue: round.pointsPerDollar,
    });

    const grossBirdieOnHole = (match: Match, hole: number) => {
      const par = parByHole.get(hole);
      if (par == null) return false;
      return [...match.team1, ...match.team2].some((pid) => {
        const g = round.scores?.[pid]?.[hole];
        return g != null && g <= par - 1;
      });
    };

    for (const match of round.matches ?? []) {
      const start = (match.rotation - 1) * 6 + 1;
      for (let hole = start; hole < start + 6; hole++) {
        const result = getMatchResultsForHole(match, hole);
        if (!result) continue;
        const mult = getMultiplierValue(getMultiplier(match.id, hole));
        const money = Math.abs(result.points * mult) * round.pointsPerDollar;
        totalMoney += money;
        if (grossBirdieOnHole(match, hole)) birdieMoney += money;
      }
    }
  }

  return { birdieMoney, totalMoney, pct: totalMoney > 0 ? (birdieMoney / totalMoney) * 100 : 0 };
}

// ---------------------------------------------------------------------------
// Season scoring: gross pars and birdies per player across all rounds.
// ---------------------------------------------------------------------------

export interface SeasonScoring {
  name: string;
  pars: number;
  birdies: number;
  eagles: number; // gross eagle or better (par − 2 or lower)
  birdiesAgainst: number; // gross birdies opponents made against this player
  holes: number; // gross holes scored (for the average)
  toParSum: number; // running sum of (gross − par) over scored holes
  avgToPar: number; // average gross score to par per 18 holes
  rounds: number;
}

interface ScoringRoundInput {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>;
}

export function computeSeasonScoring(rounds: ScoringRoundInput[]): SeasonScoring[] {
  const byName = new Map<string, SeasonScoring>();

  for (const round of rounds) {
    const parByHole = new Map((round.holes ?? []).map((h) => [h.number, h.par]));
    const isBirdie = (playerId: string, hole: number) => {
      const gross = round.scores?.[playerId]?.[hole];
      const par = parByHole.get(hole);
      return gross != null && par != null && gross === par - 1;
    };

    // Birdies opponents made against each player, tallied per match.
    const againstById = new Map<string, number>();
    for (const match of round.matches ?? []) {
      const start = (match.rotation - 1) * 6 + 1;
      let team1Birdies = 0;
      let team2Birdies = 0;
      for (let hole = start; hole < start + 6; hole++) {
        for (const pid of match.team1) if (isBirdie(pid, hole)) team1Birdies++;
        for (const pid of match.team2) if (isBirdie(pid, hole)) team2Birdies++;
      }
      for (const pid of match.team1) againstById.set(pid, (againstById.get(pid) ?? 0) + team2Birdies);
      for (const pid of match.team2) againstById.set(pid, (againstById.get(pid) ?? 0) + team1Birdies);
    }

    const countedThisRound = new Set<string>();
    for (const p of round.players ?? []) {
      const holeScores = round.scores?.[p.id] ?? {};
      let pars = 0;
      let birdies = 0;
      let eagles = 0;
      let played = 0;
      let toPar = 0;
      for (const [holeStr, gross] of Object.entries(holeScores)) {
        const par = parByHole.get(Number(holeStr));
        if (par == null || gross == null) continue;
        played++;
        toPar += gross - par;
        if (gross === par) pars++;
        else if (gross === par - 1) birdies++;
        else if (gross <= par - 2) eagles++;
      }
      if (played === 0) continue;

      const name = canonicalName(p.name);
      const key = name.toLowerCase();
      let sc = byName.get(key);
      if (!sc) {
        sc = { name, pars: 0, birdies: 0, eagles: 0, birdiesAgainst: 0, holes: 0, toParSum: 0, avgToPar: 0, rounds: 0 };
        byName.set(key, sc);
      }
      sc.pars += pars;
      sc.birdies += birdies;
      sc.eagles += eagles;
      sc.birdiesAgainst += againstById.get(p.id) ?? 0;
      sc.holes += played;
      sc.toParSum += toPar;
      if (!countedThisRound.has(key)) {
        sc.rounds += 1;
        countedThisRound.add(key);
      }
    }
  }

  const list = Array.from(byName.values());
  // Scoring average to par, normalized to 18 holes so partial rounds compare.
  list.forEach((s) => {
    s.avgToPar = s.holes > 0 ? (s.toParSum / s.holes) * 18 : 0;
  });
  // Most birdies first (tiebreak: eagles, then pars).
  return list.sort((a, b) => b.birdies - a.birdies || b.eagles - a.eagles || b.pars - a.pars);
}
