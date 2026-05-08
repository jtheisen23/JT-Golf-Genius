import { useState, useCallback, useEffect, useRef } from 'react';
import { Player, Match, HoleSetup, Round, Screen, SavedRound, MatchResult, Multiplier, HandicapMode } from '../types';
import { calculateStrokesReceived } from '../utils/handicap';
import { calculateVegasPoints, getNetScore } from '../utils/scoring';
import { saveRound } from '../utils/storage';
import { createVegasGame, saveVegasGame, subscribeVegasGame, loadVegasGame, VegasGameState } from './vegasSync';

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const GENEVA_PARS = [4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4];
const GENEVA_HDCPS = [1, 3, 9, 13, 17, 15, 5, 7, 11, 8, 2, 10, 14, 16, 18, 4, 6, 12];

const DEFAULT_HOLES: HoleSetup[] = GENEVA_PARS.map((par, i) => ({
  number: i + 1,
  par,
  handicapRating: GENEVA_HDCPS[i],
}));

const ACTIVE_ROUND_KEY = 'vegas-golf-active-round';
const ACTIVE_GAME_CODE_KEY = 'vegas-golf-game-code';

function loadActiveRound() {
  try {
    const data = localStorage.getItem(ACTIVE_ROUND_KEY);
    if (data) return JSON.parse(data);
  } catch {}
  return null;
}

function loadGameCode(): string | null {
  return localStorage.getItem(ACTIVE_GAME_CODE_KEY);
}

export function useRound() {
  const saved = loadActiveRound();

  const [screen, setScreen] = useState<Screen>(saved?.screen || 'setup');
  const [players, setPlayers] = useState<Player[]>(
    (saved?.players as Player[] | undefined)?.map((p) => ({
      ...p,
      handicapIndex: p.handicapIndex ?? p.handicap ?? 0,
    })) || [
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
    ]
  );
  const [holes, setHoles] = useState<HoleSetup[]>(saved?.holes || DEFAULT_HOLES);
  const [matches, setMatches] = useState<Match[]>(saved?.matches || []);
  const [scores, setScores] = useState<Record<string, Record<number, number>>>(saved?.scores || {});
  const [currentHole, setCurrentHole] = useState(saved?.currentHole || 1);
  const [courseName, setCourseName] = useState(saved?.courseName || 'Geneva Golf Club');
  const [pointValue, setPointValue] = useState(saved?.pointValue || 0.5);
  const [handicapMode, setHandicapMode] = useState<HandicapMode>(saved?.handicapMode || 'off-the-low');
  const [slope, setSlope] = useState<number>(saved?.slope || 132);
  const [courseRating, setCourseRating] = useState<number>(saved?.courseRating || 70);
  const [multipliers, setMultipliers] = useState<Record<string, Record<number, Multiplier>>>(saved?.multipliers || {});
  const [gameCode, setGameCode] = useState<string | null>(loadGameCode);

  // Track whether the last state update came from Firebase to avoid echo writes
  const isRemoteUpdate = useRef(false);

  // Subscribe to Firebase when we have a game code.
  //
  // Each device navigates independently — we deliberately do NOT apply
  // remote `screen` or `currentHole` here. Otherwise one user clicking
  // "Scoreboard" yanks every joined device to that view. Joiners get an
  // initial `screen` value from joinGame; from there it's per-device.
  useEffect(() => {
    if (!gameCode) return;
    const unsub = subscribeVegasGame(gameCode, (remote: VegasGameState) => {
      isRemoteUpdate.current = true;
      // Firebase RTDB drops empty arrays/objects, so default each field to a
      // safe value to avoid downstream `.forEach` / `.map` crashes on undefined.
      setPlayers(remote.players ?? []);
      setHoles(remote.holes ?? []);
      setMatches(remote.matches ?? []);
      setScores(remote.scores ?? {});
      setCourseName(remote.courseName ?? '');
      setPointValue(remote.pointValue ?? 0.5);
      setMultipliers(remote.multipliers ?? {});
      setHandicapMode(remote.handicapMode ?? 'off-the-low');
      if (remote.slope != null) setSlope(remote.slope);
      if (remote.courseRating != null) setCourseRating(remote.courseRating);
      // Clear the flag after a microtask so the subsequent useEffect skip works
      queueMicrotask(() => { isRemoteUpdate.current = false; });
    });
    return unsub;
  }, [gameCode]);

  // Auto-save to localStorage (includes currentHole for local restore)
  useEffect(() => {
    const state = { screen, players, holes, matches, scores, currentHole, courseName, pointValue, multipliers, handicapMode, slope, courseRating };
    localStorage.setItem(ACTIVE_ROUND_KEY, JSON.stringify(state));
  }, [screen, players, holes, matches, scores, currentHole, courseName, pointValue, multipliers, handicapMode, slope, courseRating]);

  // Sync to Firebase (excludes currentHole — each device navigates independently)
  useEffect(() => {
    if (!gameCode || isRemoteUpdate.current) return;
    const state = { screen, players, holes, matches, scores, currentHole, courseName, pointValue, multipliers, handicapMode, slope, courseRating };
    saveVegasGame(gameCode, state);
  }, [screen, players, holes, matches, scores, courseName, pointValue, multipliers, handicapMode, slope, courseRating, gameCode]);

  const addPlayer = useCallback(() => {
    if (players.length >= 5) return;
    setPlayers((prev) => [
      ...prev,
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
    ]);
  }, [players.length]);

  const removePlayer = useCallback((id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const updatePlayer = useCallback((id: string, field: keyof Player, value: string | number) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: value } : p))
    );
  }, []);

  const updateHole = useCallback((holeNum: number, field: keyof HoleSetup, value: number) => {
    setHoles((prev) =>
      prev.map((h) => (h.number === holeNum ? { ...h, [field]: value } : h))
    );
  }, []);

  const autoGenerateMatches = useCallback(() => {
    if (players.length < 4) return;
    const p = players;
    const newMatches: Match[] = [
      // Rotation 1: Holes 1-6
      { id: generateId(), team1: [p[0].id, p[1].id], team2: [p[2].id, p[3].id], rotation: 1 },
      // Rotation 2: Holes 7-12
      { id: generateId(), team1: [p[0].id, p[2].id], team2: [p[1].id, p[3].id], rotation: 2 },
      // Rotation 3: Holes 13-18
      { id: generateId(), team1: [p[0].id, p[3].id], team2: [p[1].id, p[2].id], rotation: 3 },
    ];

    // If 5th player, add extra matches
    // The anchor team (team1) plays against a second opponent team
    // that includes the 5th player. No player can be with AND against
    // the same person in the same rotation.
    if (players.length === 5) {
      newMatches.push(
        // R1: 1+2 already vs 3+4, now 1+2 also vs 5+3 (5 replaces 4)
        { id: generateId(), team1: [p[0].id, p[1].id], team2: [p[4].id, p[2].id], rotation: 1 },
        // R2: 1+3 already vs 2+4, now 1+3 also vs 5+4 (5 replaces 2)
        { id: generateId(), team1: [p[0].id, p[2].id], team2: [p[4].id, p[3].id], rotation: 2 },
        // R3: 1+4 already vs 2+3, now 1+4 also vs 5+2 (5 replaces 3)
        { id: generateId(), team1: [p[0].id, p[3].id], team2: [p[4].id, p[1].id], rotation: 3 },
      );
    }

    setMatches(newMatches);
  }, [players]);

  const addMatch = useCallback((team1: [string, string], team2: [string, string], rotation: number) => {
    setMatches((prev) => [...prev, { id: generateId(), team1, team2, rotation }]);
  }, []);

  const removeMatch = useCallback((matchId: string) => {
    setMatches((prev) => prev.filter((m) => m.id !== matchId));
  }, []);

  const recalculateStrokes = useCallback(() => {
    setPlayers((prev) => calculateStrokesReceived(prev, handicapMode));
  }, [handicapMode]);

  // Load a previously-saved round back into active state so it can be edited.
  const loadSavedRound = useCallback((saved: SavedRound) => {
    setPlayers(saved.players);
    setHoles(saved.holes);
    setMatches(saved.matches);
    setScores(saved.scores);
    setCourseName(saved.courseName);
    setPointValue(saved.pointsPerDollar);
    if (saved.slope != null) setSlope(saved.slope);
    if (saved.courseRating != null) setCourseRating(saved.courseRating);
    setMultipliers(saved.multipliers || {});
    setCurrentHole(1);
    setScreen('scoreboard');
  }, []);

  // Clear players/matches/scores for a fresh game, keeping course + holes + point value.
  const resetForNewGame = useCallback(() => {
    setPlayers([
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
    ]);
    setMatches([]);
    setScores({});
    setMultipliers({});
    setCurrentHole(1);
    setScreen('setup');
    setGameCode(null);
    localStorage.removeItem(ACTIVE_GAME_CODE_KEY);
  }, []);

  const startRound = useCallback(async () => {
    const updated = calculateStrokesReceived(players, handicapMode);
    setPlayers(updated);
    const initialScores: Record<string, Record<number, number>> = {};
    updated.forEach((p) => {
      initialScores[p.id] = {};
    });
    setScores(initialScores);
    setCurrentHole(1);
    setScreen('holes');

    // Create a Firebase game so other devices can join
    const state: VegasGameState = {
      screen: 'holes',
      players: updated,
      holes,
      matches,
      scores: initialScores,
      currentHole: 1,
      courseName,
      pointValue,
      multipliers,
      handicapMode,
      slope,
      courseRating,
    };
    const code = await createVegasGame(state);
    setGameCode(code);
    localStorage.setItem(ACTIVE_GAME_CODE_KEY, code);
  }, [players, handicapMode, holes, matches, courseName, pointValue, multipliers, slope, courseRating]);

  const joinGame = useCallback(async (code: string): Promise<boolean> => {
    const remote = await loadVegasGame(code);
    if (!remote) return false;
    // Firebase RTDB drops empty arrays/objects, so default each field to a
    // safe value to avoid downstream `.forEach` / `.map` crashes on undefined.
    setScreen((remote.screen as Screen) || 'scoreboard');
    setPlayers(remote.players ?? []);
    setHoles(remote.holes ?? []);
    setMatches(remote.matches ?? []);
    setScores(remote.scores ?? {});
    setCurrentHole(remote.currentHole || 1);
    setCourseName(remote.courseName ?? '');
    setPointValue(remote.pointValue ?? 0.5);
    setMultipliers(remote.multipliers ?? {});
    setHandicapMode(remote.handicapMode ?? 'off-the-low');
    if (remote.slope != null) setSlope(remote.slope);
    if (remote.courseRating != null) setCourseRating(remote.courseRating);
    setGameCode(code.toUpperCase());
    localStorage.setItem(ACTIVE_GAME_CODE_KEY, code.toUpperCase());
    return true;
  }, []);

  const setScore = useCallback((playerId: string, holeNumber: number, grossScore: number) => {
    setScores((prev) => ({
      ...prev,
      [playerId]: {
        ...prev[playerId],
        [holeNumber]: grossScore,
      },
    }));
  }, []);

  const getMultiplier = useCallback(
    (matchId: string, holeNumber: number): Multiplier => {
      return multipliers[matchId]?.[holeNumber] || 'none';
    },
    [multipliers]
  );

  const getMultiplierValue = useCallback((m: Multiplier): number => {
    switch (m) {
      case 'press': return 2;
      case 'roll': return 4;
      case 're-roll': return 8;
      default: return 1;
    }
  }, []);

  const setMatchMultiplier = useCallback((matchId: string, holeNumber: number, value: Multiplier) => {
    setMultipliers((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        [holeNumber]: value,
      },
    }));
  }, []);

  const clearScore = useCallback((playerId: string, holeNumber: number) => {
    setScores((prev) => {
      const playerScores = { ...prev[playerId] };
      delete playerScores[holeNumber];
      return { ...prev, [playerId]: playerScores };
    });
  }, []);

  const getMatchResultsForHole = useCallback(
    (match: Match, holeNumber: number) => {
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
    },
    [holes, players, scores]
  );

  const getMatchTotal = useCallback(
    (match: Match) => {
      const startHole = (match.rotation - 1) * 6 + 1;
      const endHole = match.rotation * 6;
      let total = 0;
      for (let h = startHole; h <= endHole; h++) {
        const result = getMatchResultsForHole(match, h);
        if (result) {
          const mult = getMultiplierValue(getMultiplier(match.id, h));
          total += result.points * mult;
        }
      }
      return total;
    },
    [getMatchResultsForHole, getMultiplier, getMultiplierValue]
  );

  const getPlayerMoney = useCallback(
    (playerId: string) => {
      let totalPoints = 0;
      matches.forEach((match) => {
        const total = getMatchTotal(match);
        if (match.team1.includes(playerId)) {
          totalPoints += total;
        } else if (match.team2.includes(playerId)) {
          totalPoints -= total;
        }
      });
      return totalPoints * pointValue;
    },
    [matches, getMatchTotal, pointValue]
  );

  const getCurrentRotation = useCallback(() => {
    if (currentHole <= 6) return 1;
    if (currentHole <= 12) return 2;
    return 3;
  }, [currentHole]);

  const getActiveMatches = useCallback(() => {
    const rotation = getCurrentRotation();
    return matches.filter((m) => m.rotation === rotation);
  }, [matches, getCurrentRotation]);

  const finishRound = useCallback(() => {
    const results: MatchResult[] = matches.map((match) => {
      const total = getMatchTotal(match);
      const t1Names = match.team1.map((id) => players.find((p) => p.id === id)?.name || '').join(' & ');
      const t2Names = match.team2.map((id) => players.find((p) => p.id === id)?.name || '').join(' & ');
      return {
        matchId: match.id,
        team1Names: t1Names,
        team2Names: t2Names,
        totalPoints: total,
        money: total * pointValue,
      };
    });

    const savedRound: SavedRound = {
      id: generateId(),
      date: new Date().toISOString(),
      courseName,
      players,
      holes,
      matches,
      scores,
      pointsPerDollar: pointValue,
      slope,
      courseRating,
      results,
      multipliers,
    };

    saveRound(savedRound);
    localStorage.removeItem(ACTIVE_ROUND_KEY);
    localStorage.removeItem(ACTIVE_GAME_CODE_KEY);
    setGameCode(null);

    setPlayers([
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
      { id: generateId(), name: '', handicapIndex: 0, handicap: 0, strokesReceived: 0 },
    ]);
    setMatches([]);
    setScores({});
    setMultipliers({});
    setCurrentHole(1);
  }, [matches, getMatchTotal, players, courseName, holes, scores, pointValue, slope, courseRating]);

  return {
    screen,
    setScreen,
    players,
    addPlayer,
    removePlayer,
    updatePlayer,
    holes,
    updateHole,
    matches,
    setMatches,
    autoGenerateMatches,
    addMatch,
    removeMatch,
    scores,
    setScore,
    clearScore,
    currentHole,
    setCurrentHole,
    courseName,
    setCourseName,
    pointValue,
    setPointValue,
    startRound,
    getMatchResultsForHole,
    getMatchTotal,
    getPlayerMoney,
    getCurrentRotation,
    getActiveMatches,
    finishRound,
    multipliers,
    getMultiplier,
    getMultiplierValue,
    setMatchMultiplier,
    handicapMode,
    setHandicapMode,
    slope,
    setSlope,
    courseRating,
    setCourseRating,
    recalculateStrokes,
    resetForNewGame,
    loadSavedRound,
    gameCode,
    joinGame,
  };
}
