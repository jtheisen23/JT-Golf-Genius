/**
 * Calculate the Vegas score for a single hole between two teams.
 *
 * Rules (ranked, higher-tier trigger beats lower-tier suppressor):
 * - Each team's two net scores form a two-digit number (lower digit first → e.g. 4,5 = 45)
 * - FLIP TRIGGERS (ordered):
 *     • Net eagle or better  (net <= par-2) — higher tier
 *     • Gross birdie or better (gross <= par-1) — lower tier
 * - SUPPRESSION (opponent prevents being flipped):
 *     • Net eagle trigger is suppressed only if opponent's low net is ALSO eagle-or-better
 *       (≤ par-2). A gross birdie does NOT suppress a net eagle — i.e. a net eagle
 *       flips a gross birdie.
 *     • Gross birdie trigger is suppressed if opponent's low net is birdie-or-better
 *       (≤ par-1).
 * - Points = opponent's number - your number (positive = you win)
 */
export function calculateVegasPoints(
  team1Scores: [number, number],
  team2Scores: [number, number],
  par: number,
  team1Gross: [number, number],
  team2Gross: [number, number]
): { team1Vegas: number; team2Vegas: number; points: number } {
  const team1NetEagle =
    team1Scores[0] <= par - 2 || team1Scores[1] <= par - 2;
  const team2NetEagle =
    team2Scores[0] <= par - 2 || team2Scores[1] <= par - 2;
  const team1GrossBirdie =
    team1Gross[0] <= par - 1 || team1Gross[1] <= par - 1;
  const team2GrossBirdie =
    team2Gross[0] <= par - 1 || team2Gross[1] <= par - 1;

  const sorted1 = [...team1Scores].sort((a, b) => a - b) as [number, number];
  const sorted2 = [...team2Scores].sort((a, b) => a - b) as [number, number];

  // Net eagle flips unless opponent also has net eagle (or better).
  // Otherwise, gross birdie flips unless opponent's low net is birdie-or-better.
  const flipTeam2 = team1NetEagle
    ? sorted2[0] > par - 2
    : team1GrossBirdie
      ? sorted2[0] > par - 1
      : false;
  const flipTeam1 = team2NetEagle
    ? sorted1[0] > par - 2
    : team2GrossBirdie
      ? sorted1[0] > par - 1
      : false;

  // Normal: lower digit first. Flipped: higher digit first.
  const team1Vegas = flipTeam1
    ? sorted1[1] * 10 + sorted1[0]
    : sorted1[0] * 10 + sorted1[1];

  const team2Vegas = flipTeam2
    ? sorted2[1] * 10 + sorted2[0]
    : sorted2[0] * 10 + sorted2[1];

  const points = team2Vegas - team1Vegas;

  return { team1Vegas, team2Vegas, points };
}

/**
 * Calculate a player's total money from a raw VegasGameState.
 * Replicates useRound.getPlayerMoney without requiring hooks.
 */
export function calculatePlayerMoney(
  state: {
    players: { id: string; strokesReceived: number }[];
    holes: { number: number; par: number; handicapRating: number }[];
    matches: { id: string; team1: [string, string]; team2: [string, string]; rotation: number }[];
    scores: Record<string, Record<number, number>>;
    pointValue: number;
    multipliers: Record<string, Record<number, string>>;
  },
  playerId: string,
): number {
  const { players, holes, matches, scores, pointValue, multipliers } = state;
  const playerMap = new Map(players.map((p) => [p.id, p]));

  const multValue = (m: string): number => {
    if (m === 'press') return 2;
    if (m === 'roll') return 4;
    if (m === 're-roll') return 8;
    return 1;
  };

  let totalPoints = 0;
  for (const match of matches) {
    const startHole = (match.rotation - 1) * 6 + 1;
    const endHole = match.rotation * 6;
    let matchTotal = 0;

    for (let h = startHole; h <= endHole; h++) {
      const hole = holes.find((x) => x.number === h);
      if (!hole) continue;

      const p1 = playerMap.get(match.team1[0]);
      const p2 = playerMap.get(match.team1[1]);
      const p3 = playerMap.get(match.team2[0]);
      const p4 = playerMap.get(match.team2[1]);
      if (!p1 || !p2 || !p3 || !p4) continue;

      const g1 = scores[p1.id]?.[h];
      const g2 = scores[p2.id]?.[h];
      const g3 = scores[p3.id]?.[h];
      const g4 = scores[p4.id]?.[h];
      if (g1 == null || g2 == null || g3 == null || g4 == null) continue;

      const n1 = getNetScore(g1, p1.strokesReceived, hole.handicapRating);
      const n2 = getNetScore(g2, p2.strokesReceived, hole.handicapRating);
      const n3 = getNetScore(g3, p3.strokesReceived, hole.handicapRating);
      const n4 = getNetScore(g4, p4.strokesReceived, hole.handicapRating);

      const result = calculateVegasPoints([n1, n2], [n3, n4], hole.par, [g1, g2], [g3, g4]);
      // Firebase may return multipliers as array or object with string keys
      const matchMults = multipliers?.[match.id];
      const holeMultRaw = matchMults
        ? (matchMults as Record<string, string>)[String(h)] ?? (matchMults as Record<number, string>)[h]
        : undefined;
      const mult = multValue(holeMultRaw || 'none');
      matchTotal += result.points * mult;
    }

    if (match.team1.includes(playerId)) totalPoints += matchTotal;
    else if (match.team2.includes(playerId)) totalPoints -= matchTotal;
  }

  return totalPoints * pointValue;
}

/**
 * Get the net score for a player on a specific hole.
 */
export function getNetScore(
  grossScore: number,
  playerStrokesReceived: number,
  holeHandicapRating: number,
  totalHoles: number = 18
): number {
  // Player gets a stroke on this hole if their strokes received >= hole handicap rating
  // For strokes > 18, they get 2 strokes on the easiest holes
  let strokes = 0;
  if (playerStrokesReceived >= holeHandicapRating) {
    strokes = 1;
  }
  if (playerStrokesReceived >= totalHoles + holeHandicapRating) {
    strokes = 2;
  }
  return grossScore - strokes;
}
