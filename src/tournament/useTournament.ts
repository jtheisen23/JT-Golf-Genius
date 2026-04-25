import { useCallback, useEffect, useRef, useState } from 'react';
import { sync } from './sync';
import { nextDateForDay } from './dateUtils';
import type { PlayDay, Tournament, TourGroup, TourHole, TourPlayer, TournamentFormat } from './types';

export function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

const DEFAULT_PARS = [4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4];
const DEFAULT_HDCPS = [1, 3, 9, 13, 17, 15, 5, 7, 11, 8, 2, 10, 14, 16, 18, 4, 6, 12];

export function defaultHoles(): TourHole[] {
  return DEFAULT_PARS.map((par, i) => ({
    number: i + 1,
    par,
    handicapRating: DEFAULT_HDCPS[i],
  }));
}

export function createTournament(input: {
  name: string;
  courseName: string;
  playDay?: PlayDay;
  date?: string;
  format?: TournamentFormat;
  handicapAllowance?: number;
}): Tournament {
  const now = new Date().toISOString();
  const date = input.date || (input.playDay ? nextDateForDay(input.playDay) : now.slice(0, 10));
  return {
    id: generateId(),
    name: input.name,
    courseName: input.courseName,
    date,
    playDay: input.playDay,
    holes: defaultHoles(),
    players: {},
    groups: [],
    scores: {},
    format: input.format || 'both',
    handicapAllowance: input.handicapAllowance ?? 100,
    startTime: '08:00',
    teeTimeInterval: 12,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * useTournament subscribes to a tournament by id and exposes mutators
 * that persist through the sync adapter so every tab/viewer stays in step.
 */
export function useTournament(eventId: string | null) {
  const [subscribedId, setSubscribedId] = useState<string | null>(null);
  const [tournament, setTournament] = useState<Tournament | null>(() =>
    eventId ? sync.load(eventId) : null,
  );

  // Re-sync when eventId changes. Derive the "fresh load" state from props
  // instead of calling setState inside the effect body.
  if (subscribedId !== eventId) {
    setSubscribedId(eventId);
    setTournament(eventId ? sync.load(eventId) : null);
  }

  useEffect(() => {
    if (!eventId) return;
    const unsub = sync.subscribe(eventId, (t) => setTournament(t));
    return unsub;
  }, [eventId]);

  const tournamentRef = useRef(tournament);
  tournamentRef.current = tournament;

  const mutate = useCallback(
    (fn: (t: Tournament) => Tournament) => {
      if (!eventId) return;
      const current = sync.load(eventId) ?? tournamentRef.current;
      if (!current) return;
      const next = fn(current);
      sync.save(next);
      setTournament(next);
    },
    [eventId],
  );

  const setScore = useCallback(
    (groupId: string, playerId: string, hole: number, value: number | null) => {
      mutate((t) => {
        const groupScores = { ...(t.scores[groupId] || {}) };
        const playerScores = { ...(groupScores[playerId] || {}) };
        if (value == null) delete playerScores[hole];
        else playerScores[hole] = value;
        groupScores[playerId] = playerScores;
        return { ...t, scores: { ...t.scores, [groupId]: groupScores } };
      });
    },
    [mutate],
  );

  const addPlayer = useCallback(
    (player: TourPlayer) => {
      mutate((t) => ({ ...t, players: { ...t.players, [player.id]: player } }));
    },
    [mutate],
  );

  const updatePlayer = useCallback(
    (id: string, patch: Partial<TourPlayer>) => {
      mutate((t) => {
        const existing = t.players[id];
        if (!existing) return t;
        return { ...t, players: { ...t.players, [id]: { ...existing, ...patch } } };
      });
    },
    [mutate],
  );

  const removePlayer = useCallback(
    (id: string) => {
      mutate((t) => {
        const players = { ...t.players };
        delete players[id];
        const groups = t.groups.map((g) => ({
          ...g,
          playerIds: g.playerIds.filter((pid) => pid !== id),
        }));
        return { ...t, players, groups };
      });
    },
    [mutate],
  );

  const addGroup = useCallback(
    (group: TourGroup) => {
      mutate((t) => ({ ...t, groups: [...t.groups, group] }));
    },
    [mutate],
  );

  const updateGroup = useCallback(
    (id: string, patch: Partial<TourGroup>) => {
      mutate((t) => ({
        ...t,
        groups: t.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      }));
    },
    [mutate],
  );

  const removeGroup = useCallback(
    (id: string) => {
      mutate((t) => {
        const scores = { ...t.scores };
        delete scores[id];
        return { ...t, groups: t.groups.filter((g) => g.id !== id), scores };
      });
    },
    [mutate],
  );

  const setGroups = useCallback(
    (groups: TourGroup[]) => {
      mutate((t) => {
        // Drop scores for groups that no longer exist so we don't leak data.
        const nextIds = new Set(groups.map((g) => g.id));
        const scores: typeof t.scores = {};
        Object.entries(t.scores).forEach(([gid, s]) => {
          if (nextIds.has(gid)) scores[gid] = s;
        });
        return { ...t, groups, scores };
      });
    },
    [mutate],
  );

  const updateHole = useCallback(
    (holeNumber: number, patch: Partial<TourHole>) => {
      mutate((t) => ({
        ...t,
        holes: t.holes.map((h) => (h.number === holeNumber ? { ...h, ...patch } : h)),
      }));
    },
    [mutate],
  );

  const updateMeta = useCallback(
    (
      patch: Partial<
        Pick<
          Tournament,
          | 'name'
          | 'courseName'
          | 'date'
          | 'format'
          | 'handicapAllowance'
          | 'playDay'
          | 'startTime'
          | 'teeTimeInterval'
        >
      >,
    ) => {
      mutate((t) => ({ ...t, ...patch }));
    },
    [mutate],
  );

  return {
    tournament,
    setScore,
    addPlayer,
    updatePlayer,
    removePlayer,
    addGroup,
    updateGroup,
    removeGroup,
    setGroups,
    updateHole,
    updateMeta,
  };
}
