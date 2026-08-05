import { ref, set, onValue, get } from 'firebase/database';
import { db } from '../firebase';
import type { Player, Match, HoleSetup, Multiplier, HandicapMode } from '../types';
import type { TourPlayer, TourHole } from '../tournament/types';
import { calculateStrokesReceived } from '../utils/handicap';

/** The shape we persist to Firebase for an active Vegas game. */
export interface VegasGameState {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>;
  currentHole: number;
  courseName: string;
  pointValue: number;
  multipliers: Record<string, Record<number, Multiplier>>;
  handicapMode: HandicapMode;
  screen: string;
  slope?: number;
  courseRating?: number;
  /** Tournament + group this Vegas game was launched from. When set, score
   *  writes are mirrored to tournament.scores so the tournament side has a
   *  durable second copy that survives any Vegas-doc wipe. */
  tournamentId?: string;
  groupId?: string;
}

function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** Create a new Vegas game in Firebase and return its game code. */
export async function createVegasGame(state: VegasGameState): Promise<string> {
  const code = generateCode();
  const gameRef = ref(db, `vegas/${code}`);
  await set(gameRef, state);
  return code;
}

/** Coerce a raw Firebase document into a fully-populated VegasGameState.
 *  Firebase RTDB silently drops empty arrays/objects, so callers cannot
 *  assume any field exists. Centralizing this defaulting here means every
 *  downstream consumer (joinGame, subscribe, leaderboard, scoring) sees a
 *  consistent shape and never has to forEach/map on undefined. */
function sanitizeVegasState(raw: unknown): VegasGameState {
  const r = (raw ?? {}) as Partial<VegasGameState>;
  return {
    screen: r.screen ?? 'scoreboard',
    players: r.players ?? [],
    holes: r.holes ?? [],
    matches: r.matches ?? [],
    scores: r.scores ?? {},
    currentHole: r.currentHole ?? 1,
    courseName: r.courseName ?? '',
    pointValue: r.pointValue ?? 0.5,
    multipliers: r.multipliers ?? {},
    handicapMode: r.handicapMode ?? 'off-the-low',
    slope: r.slope,
    courseRating: r.courseRating,
    tournamentId: r.tournamentId,
    groupId: r.groupId,
  };
}

/** Load a Vegas game by code. Returns null if not found. */
export async function loadVegasGame(code: string): Promise<VegasGameState | null> {
  const snap = await get(ref(db, `vegas/${code.toUpperCase()}`));
  return snap.exists() ? sanitizeVegasState(snap.val()) : null;
}

/** Has the state recorded any actual gross scores yet? Used as the "did this
 *  round get played?" check when guarding against accidental wipes. */
function hasScores(state: VegasGameState): boolean {
  for (const playerScores of Object.values(state.scores ?? {})) {
    if (Object.keys(playerScores).length > 0) return true;
  }
  return false;
}

/** Save full Vegas game state to Firebase, refusing to wipe a populated remote
 *  doc with a blank one. Without this guard, a race between the Firebase
 *  onValue listener clearing isRemoteUpdate and the sync useEffect committing
 *  with the post-finishRound reset state can echo an empty payload back to
 *  Firebase and erase a real round's worth of scores. */
export function saveVegasGame(code: string, state: VegasGameState): void {
  if (hasScores(state)) {
    set(ref(db, `vegas/${code}`), state);
    return;
  }
  // New state has no scores — only allow the write if the remote doc is also
  // empty (e.g. first save right after createVegasGame, or a doc that never
  // had scores). Read-then-write is fire-and-forget; matches the existing
  // call-sites that don't await this function.
  get(ref(db, `vegas/${code}`)).then((snap) => {
    if (!snap.exists()) {
      set(ref(db, `vegas/${code}`), state);
      return;
    }
    if (!hasScores(sanitizeVegasState(snap.val()))) {
      set(ref(db, `vegas/${code}`), state);
    }
    // else: silently refuse — the remote already has scores, this empty
    // write would be the bug we are guarding against.
  }).catch(() => {});
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/**
 * Create a Vegas game pre-populated from a tournament group.
 * Converts TourPlayers → Players, auto-generates matches, and pushes to Firebase.
 * Returns the game code.
 */
export async function createVegasGameFromTournament(
  tourPlayers: TourPlayer[],
  tourHoles: TourHole[],
  courseName: string,
  pointValue = 0.5,
  handicapMode: HandicapMode = 'off-the-low',
  tournamentId?: string,
  groupId?: string,
  existingScores?: Record<string, Record<number, number>>,
): Promise<string> {
  // Convert TourPlayer → Player
  const rawPlayers: Player[] = tourPlayers.map((tp) => ({
    id: tp.id,
    name: tp.name,
    handicapIndex: (tp as { handicapIndex?: number }).handicapIndex ?? tp.courseHandicap,
    handicap: tp.courseHandicap,
    strokesReceived: 0,
  }));

  // Calculate strokes received
  const players = calculateStrokesReceived(rawPlayers, handicapMode);

  // Convert TourHole → HoleSetup
  const holes: HoleSetup[] = tourHoles.map((h) => ({
    number: h.number,
    par: h.par,
    handicapRating: h.handicapRating,
  }));

  // Auto-generate matches (same logic as useRound.autoGenerateMatches)
  const matches: Match[] = [];
  if (players.length >= 4) {
    const p = players;
    matches.push(
      { id: generateId(), team1: [p[0].id, p[1].id], team2: [p[2].id, p[3].id], rotation: 1 },
      { id: generateId(), team1: [p[0].id, p[2].id], team2: [p[1].id, p[3].id], rotation: 2 },
      { id: generateId(), team1: [p[0].id, p[3].id], team2: [p[1].id, p[2].id], rotation: 3 },
    );
    if (players.length >= 5) {
      matches.push(
        { id: generateId(), team1: [p[0].id, p[1].id], team2: [p[4].id, p[2].id], rotation: 1 },
        { id: generateId(), team1: [p[0].id, p[2].id], team2: [p[4].id, p[3].id], rotation: 2 },
        { id: generateId(), team1: [p[0].id, p[3].id], team2: [p[4].id, p[1].id], rotation: 3 },
      );
    }
  }

  // Seed scores from any already recorded for this group so relaunching a Vegas
  // game resumes where scoring left off instead of starting blank.
  const scores: Record<string, Record<number, number>> = {};
  players.forEach((p) => {
    scores[p.id] = { ...(existingScores?.[p.id] ?? {}) };
  });
  // Resume on the first hole that isn't fully scored yet.
  const firstUnscored =
    holes.find((h) => players.some((p) => scores[p.id]?.[h.number] == null))?.number ?? 1;

  const state: VegasGameState = {
    screen: 'holes',
    players,
    holes,
    matches,
    scores,
    currentHole: firstUnscored,
    courseName,
    pointValue,
    multipliers: {},
    handicapMode,
    tournamentId,
    groupId,
  };

  return createVegasGame(state);
}

/** Subscribe to real-time updates for a Vegas game. Returns unsubscribe function. */
export function subscribeVegasGame(
  code: string,
  listener: (state: VegasGameState) => void,
): () => void {
  const gameRef = ref(db, `vegas/${code}`);
  return onValue(gameRef, (snap) => {
    if (!snap.exists()) return;
    listener(sanitizeVegasState(snap.val()));
  });
}
