import { ref, set, get, remove } from 'firebase/database';
import { db } from '../firebase';
import { SavedRound } from '../types';

const STORAGE_KEY = 'vegas-golf-rounds';
// Finished rounds are mirrored here so every device sees the same history.
const CLOUD_PATH = 'vegas-rounds';

export function saveRound(round: SavedRound): void {
  const rounds = loadRounds();
  rounds.unshift(round);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
  saveRoundCloud(round);
}

export function loadRounds(): SavedRound[] {
  const data = localStorage.getItem(STORAGE_KEY);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export function deleteRound(roundId: string): void {
  const rounds = loadRounds().filter((r) => r.id !== roundId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rounds));
  try {
    remove(ref(db, `${CLOUD_PATH}/${roundId}`));
  } catch {
    // Offline / Firebase unavailable — local delete still applied.
  }
}

// --- Cloud sync (Firebase) -------------------------------------------------

// Write a finished round to the shared history. Fire-and-forget; the local
// copy is the immediate source of truth.
export function saveRoundCloud(round: SavedRound): void {
  try {
    // Strip undefined (Firebase rejects it) via a JSON round-trip.
    const clean = JSON.parse(JSON.stringify(round));
    set(ref(db, `${CLOUD_PATH}/${round.id}`), clean);
  } catch {
    // Offline / Firebase unavailable — round stays in local history.
  }
}

// Firebase drops empty arrays and returns arrays-with-gaps as objects, so
// normalize the shapes downstream code expects.
function normalizeRound(raw: Record<string, unknown>): SavedRound {
  const r = raw as unknown as SavedRound;
  const arr = <T,>(v: unknown): T[] => (Array.isArray(v) ? v : v ? (Object.values(v) as T[]) : []);
  return {
    ...r,
    players: arr(r.players),
    holes: arr(r.holes),
    matches: arr(r.matches),
    results: arr(r.results),
    scores: r.scores ?? {},
    multipliers: r.multipliers ?? {},
  };
}

export async function fetchCloudRounds(): Promise<SavedRound[]> {
  try {
    const snap = await get(ref(db, CLOUD_PATH));
    const val = snap.val();
    if (!val) return [];
    return Object.values(val).map((r) => normalizeRound(r as Record<string, unknown>));
  } catch {
    return [];
  }
}
