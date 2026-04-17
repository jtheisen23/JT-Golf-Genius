import { ref, set, onValue, get } from 'firebase/database';
import { db } from '../firebase';
import type { Player, Match, HoleSetup, Multiplier, HandicapMode } from '../types';

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

/** Load a Vegas game by code. Returns null if not found. */
export async function loadVegasGame(code: string): Promise<VegasGameState | null> {
  const snap = await get(ref(db, `vegas/${code.toUpperCase()}`));
  return snap.exists() ? (snap.val() as VegasGameState) : null;
}

/** Save full Vegas game state to Firebase. */
export function saveVegasGame(code: string, state: VegasGameState): void {
  set(ref(db, `vegas/${code}`), state);
}

/** Subscribe to real-time updates for a Vegas game. Returns unsubscribe function. */
export function subscribeVegasGame(
  code: string,
  listener: (state: VegasGameState) => void,
): () => void {
  const gameRef = ref(db, `vegas/${code}`);
  return onValue(gameRef, (snap) => {
    const val = snap.val() as VegasGameState | null;
    if (val) listener(val);
  });
}
