import { ref, set, onValue, remove as fbRemove, get, update } from 'firebase/database';
import { db } from '../firebase';
import type { Tournament, TourPlayer } from './types';

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
  /**
   * Path-specific score write. Touches only
   * `tournaments/{eventId}/scores/{groupId}/{playerId}/{hole}` so concurrent
   * full-document writes from other clients can't blank out other holes.
   */
  saveScore(
    eventId: string,
    groupId: string,
    playerId: string,
    hole: number,
    value: number | null,
  ): void;
  /** Path-specific player update — same race-safety reasoning as saveScore. */
  savePlayer(eventId: string, player: TourPlayer): void;
  /** Path-specific top-level field update (e.g. tee-time backfill). */
  saveMeta(eventId: string, patch: Partial<Tournament>): void;
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

  saveScore(
    eventId: string,
    groupId: string,
    playerId: string,
    hole: number,
    value: number | null,
  ): void {
    const updatedAt = new Date().toISOString();

    // Keep the in-memory cache in step with the targeted write so subsequent
    // mutate()s don't read a stale tournament and write the cell back blank.
    const cached = this.cache.get(eventId);
    if (cached) {
      const groupScores = { ...(cached.scores[groupId] || {}) };
      const playerScores = { ...(groupScores[playerId] || {}) };
      if (value == null) delete playerScores[hole];
      else playerScores[hole] = value;
      groupScores[playerId] = playerScores;
      this.cache.set(eventId, {
        ...cached,
        scores: { ...cached.scores, [groupId]: groupScores },
        updatedAt,
      });
    }

    const cellPath = `tournaments/${eventId}/scores/${groupId}/${playerId}/${hole}`;
    if (value == null) {
      fbRemove(ref(db, cellPath));
    } else {
      set(ref(db, cellPath), value);
    }
    set(ref(db, `tournaments/${eventId}/updatedAt`), updatedAt);

    // Make sure the index has us — handles the edge case of a brand-new
    // tournament where save() hasn't run yet.
    set(ref(db, `tournament-index/${eventId}`), true);
  }

  savePlayer(eventId: string, player: TourPlayer): void {
    const updatedAt = new Date().toISOString();

    const cached = this.cache.get(eventId);
    if (cached) {
      this.cache.set(eventId, {
        ...cached,
        players: { ...cached.players, [player.id]: player },
        updatedAt,
      });
    }

    // update() merges these two paths in one round-trip without disturbing
    // sibling fields like `scores`.
    const clean = JSON.parse(JSON.stringify(player));
    update(ref(db, `tournaments/${eventId}`), {
      [`players/${player.id}`]: clean,
      updatedAt,
    });
    set(ref(db, `tournament-index/${eventId}`), true);
  }

  /** Path-specific top-level field update (e.g. tee-time backfill from EventHome). */
  saveMeta(eventId: string, patch: Partial<Tournament>): void {
    const updatedAt = new Date().toISOString();

    const cached = this.cache.get(eventId);
    if (cached) {
      this.cache.set(eventId, { ...cached, ...patch, updatedAt });
    }

    const clean = JSON.parse(JSON.stringify(patch));
    update(ref(db, `tournaments/${eventId}`), { ...clean, updatedAt });
    set(ref(db, `tournament-index/${eventId}`), true);
  }
}

export const sync: SyncAdapter = new FirebaseSync();
