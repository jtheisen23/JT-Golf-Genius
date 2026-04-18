import { ref, set, onValue, remove as fbRemove, get } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament } from './types';

/** Firebase drops empty arrays and converts arrays with gaps to objects.
 *  Normalize so downstream code always sees the expected shapes. */
function sanitizeTournament(raw: Record<string, unknown>): Tournament {
  const t = raw as unknown as Tournament;
  return {
    ...t,
    groups: Array.isArray(t.groups) ? t.groups : (t.groups ? Object.values(t.groups) : []),
    holes: Array.isArray(t.holes) ? t.holes : (t.holes ? Object.values(t.holes) : []),
    players: t.players ?? {},
    scores: t.scores ?? {},
  };
}

/**
 * SyncAdapter abstracts real-time tournament state propagation.
 * FirebaseSync uses Firebase Realtime Database for cross-device sync.
 */
export interface SyncAdapter {
  load(eventId: string): Tournament | null;
  save(tournament: Tournament): void;
  subscribe(eventId: string, listener: (t: Tournament) => void): () => void;
  listEventIds(): string[];
  remove(eventId: string): void;
  /** Fetch all tournaments from Firebase, populate cache, return them. */
  fetchAll(): Promise<Tournament[]>;
}

/**
 * FirebaseSync uses Firebase Realtime Database.
 * - An in-memory cache keeps load() synchronous (required by useTournament's mutate pattern).
 * - subscribe() sets up onValue listeners that update the cache and notify the UI.
 * - listEventIds() reads from an in-memory index kept in sync via onValue.
 */
export class FirebaseSync implements SyncAdapter {
  private cache = new Map<string, Tournament>();
  private indexIds: string[] = [];
  private indexUnsub: (() => void) | null = null;

  constructor() {
    // Subscribe to the tournament index for live updates
    const indexRef = ref(db, 'tournament-index');
    const unsub = onValue(indexRef, (snap) => {
      const val = snap.val();
      this.indexIds = val ? Object.keys(val) : [];
    }, () => {
      // Firebase connection error — index stays empty, app still works
    });
    this.indexUnsub = unsub;

    // Seed index from a one-time read so listEventIds works immediately
    get(indexRef).then((snap) => {
      const val = snap.val();
      if (val) this.indexIds = Object.keys(val);
    }).catch(() => {});
  }

  load(eventId: string): Tournament | null {
    return this.cache.get(eventId) ?? null;
  }

  save(tournament: Tournament): void {
    const updated = { ...tournament, updatedAt: new Date().toISOString() };
    this.cache.set(updated.id, updated);

    // Strip undefined values — Firebase rejects them
    const clean = JSON.parse(JSON.stringify(updated));

    // Write full tournament to Firebase
    const tRef = ref(db, `tournaments/${updated.id}`);
    set(tRef, clean);

    // Ensure it's in the index
    const idxRef = ref(db, `tournament-index/${updated.id}`);
    set(idxRef, true);
  }

  subscribe(eventId: string, listener: (t: Tournament) => void): () => void {
    const tRef = ref(db, `tournaments/${eventId}`);

    // Fire the listener immediately with cached data so the UI doesn't flash null
    const cached = this.cache.get(eventId);
    if (cached) {
      queueMicrotask(() => listener(cached));
    }

    const unsub = onValue(tRef, (snap) => {
      const raw = snap.val();
      if (raw) {
        const val = sanitizeTournament(raw);
        this.cache.set(eventId, val);
        listener(val);
      }
      // If raw is null but we have cache, don't overwrite — the set() may still be in flight
    }, () => {
      // Firebase error — ignore, cache still works
    });
    return unsub;
  }

  listEventIds(): string[] {
    return this.indexIds;
  }

  remove(eventId: string): void {
    this.cache.delete(eventId);
    fbRemove(ref(db, `tournaments/${eventId}`));
    fbRemove(ref(db, `tournament-index/${eventId}`));
  }

  async fetchAll(): Promise<Tournament[]> {
    const snap = await get(ref(db, 'tournaments'));
    const val = snap.val();
    if (!val) return [];
    const tournaments: Tournament[] = [];
    for (const [id, raw] of Object.entries(val)) {
      const t = sanitizeTournament(raw as Record<string, unknown>);
      this.cache.set(id, t);
      tournaments.push(t);
    }
    // Also update index
    this.indexIds = tournaments.map((t) => t.id);
    return tournaments;
  }
}

export const sync: SyncAdapter = new FirebaseSync();
