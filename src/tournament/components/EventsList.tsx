import { useEffect, useState } from 'react';
import { sync } from '../sync';
import { createTournament } from '../useTournament';
import { PLAY_DAYS, PLAY_DAY_LABELS, formatPlayDate, isFuture, nextDateForDay } from '../dateUtils';
import type { PlayDay, Tournament } from '../types';

interface Props {
  onOpenEvent: (id: string) => void;
  onOpenRegistration: (id: string) => void;
  onOpenLeaderboard: (id: string) => void;
  onOpenResults: () => void;
  onOpenRounds: () => void;
  onExit: () => void;
}

function loadAllEvents(): Tournament[] {
  return sync
    .listEventIds()
    .map((id) => sync.load(id))
    .filter((t): t is Tournament => t != null);
}

function upcomingForDay(events: Tournament[], day: PlayDay): Tournament | null {
  const matches = events
    .filter((e) => e.playDay === day && isFuture(e.date))
    .sort((a, b) => a.date.localeCompare(b.date));
  return matches[0] || null;
}

function pastForDay(events: Tournament[], day: PlayDay): Tournament[] {
  return events
    .filter((e) => e.playDay === day && !isFuture(e.date))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function otherEvents(events: Tournament[]): Tournament[] {
  return events.filter((e) => !e.playDay);
}

export default function EventsList({
  onOpenEvent,
  onOpenRegistration,
  onOpenLeaderboard,
  onOpenResults,
  onOpenRounds,
  onExit,
}: Props) {
  const [events, setEvents] = useState<Tournament[]>(() => loadAllEvents());
  const [creatingOther, setCreatingOther] = useState(false);
  const [name, setName] = useState('');
  const [courseName, setCourseName] = useState('');

  // Fetch all tournaments from Firebase on mount (cache may be empty after refresh)
  useEffect(() => {
    sync.fetchAll().then((all) => {
      if (all.length > 0) setEvents(all);
    });
  }, []);

  const refresh = () => {
    // Try cache first, then fetch from Firebase
    const cached = loadAllEvents();
    setEvents(cached);
    if (cached.length === 0) {
      sync.fetchAll().then((all) => setEvents(all));
    }
  };

  const createForDay = (day: PlayDay) => {
    const t = createTournament({
      name: `${PLAY_DAY_LABELS[day]} Play`,
      courseName: 'Course',
      playDay: day,
    });
    sync.save(t);
    refresh();
    onOpenEvent(t.id);
  };

  const createOther = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const t = createTournament({
      name: trimmed,
      courseName: courseName.trim() || 'Course',
    });
    sync.save(t);
    onOpenEvent(t.id);
    setName('');
    setCourseName('');
    setCreatingOther(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this event?')) return;
    sync.remove(id);
    refresh();
  };

  const others = otherEvents(events);

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-4 pb-8">
      <header className="flex items-center justify-between mb-3">
        <button onClick={onExit} className="text-sm text-neutral-400">
          ← Home
        </button>
        <h1 className="font-bold">Tournaments</h1>
        <div className="w-10" />
      </header>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <button
          onClick={onOpenResults}
          className="py-2.5 bg-neutral-900 border border-neutral-700 rounded-xl text-sm font-semibold text-emerald-400 active:bg-neutral-800"
        >
          View Past Results
        </button>
        <button
          onClick={onOpenRounds}
          className="py-2.5 bg-neutral-900 border border-neutral-700 rounded-xl text-sm font-semibold text-red-400 active:bg-neutral-800"
        >
          🎲 Past Rounds
        </button>
      </div>

      <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Weekly play</h2>
      <div className="space-y-3 mb-6">
        {PLAY_DAYS.map((day) => {
          const upcoming = upcomingForDay(events, day);
          const past = pastForDay(events, day);
          return (
            <DayCard
              key={day}
              day={day}
              upcoming={upcoming}
              pastCount={past.length}
              onCreate={() => createForDay(day)}
              onOpen={onOpenEvent}
              onRegister={onOpenRegistration}
              onLeaderboard={onOpenLeaderboard}
              onSeeAll={() => {
                /* inline list already visible below */
              }}
            />
          );
        })}
      </div>

      {PLAY_DAYS.some((d) => pastForDay(events, d).length > 0) && (
        <>
          <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Past weeks</h2>
          <div className="space-y-1 mb-6">
            {PLAY_DAYS.flatMap((d) => pastForDay(events, d)).map((e) => (
              <EventRow
                key={e.id}
                event={e}
                onOpen={() => onOpenEvent(e.id)}
                onDelete={() => handleDelete(e.id)}
              />
            ))}
          </div>
        </>
      )}

      <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-2">One-off events</h2>
      {!creatingOther ? (
        <button
          onClick={() => setCreatingOther(true)}
          className="w-full py-2.5 bg-neutral-900 text-neutral-300 font-semibold rounded-lg mb-3 text-sm"
        >
          + New one-off event
        </button>
      ) : (
        <form
          className="bg-neutral-900 rounded-lg p-4 mb-3 space-y-3"
          onSubmit={(e) => { e.preventDefault(); createOther(); }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Event name"
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2"
          />
          <input
            value={courseName}
            onChange={(e) => setCourseName(e.target.value)}
            placeholder="Course name"
            className="w-full bg-neutral-800 border border-neutral-700 rounded px-3 py-2"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setCreatingOther(false);
                setName('');
                setCourseName('');
              }}
              className="flex-1 py-2 bg-neutral-800 rounded text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="flex-1 py-2 bg-emerald-600 rounded text-sm font-semibold disabled:opacity-40 active:bg-emerald-700 active:scale-95 transition-all duration-100"
            >
              Create
            </button>
          </div>
        </form>
      )}
      {others.length > 0 && (
        <div className="space-y-1">
          {others.map((e) => (
            <EventRow
              key={e.id}
              event={e}
              onOpen={() => onOpenEvent(e.id)}
              onDelete={() => handleDelete(e.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function DayCard({
  day,
  upcoming,
  pastCount,
  onCreate,
  onOpen,
  onRegister,
  onLeaderboard,
}: {
  day: PlayDay;
  upcoming: Tournament | null;
  pastCount: number;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onRegister: (id: string) => void;
  onLeaderboard: (id: string) => void;
  onSeeAll: () => void;
}) {
  const accent = day === 'friday' ? 'from-sky-900 to-sky-700' : 'from-amber-900 to-amber-700';
  const nextDate = nextDateForDay(day);

  if (!upcoming) {
    return (
      <div className={`bg-gradient-to-br ${accent} rounded-2xl p-4`}>
        <div className="flex items-start justify-between mb-1">
          <div>
            <div className="text-xs uppercase tracking-widest opacity-80">{PLAY_DAY_LABELS[day]} play</div>
            <div className="font-bold text-lg">Next: {formatPlayDate(nextDate)}</div>
          </div>
          {pastCount > 0 && (
            <span className="text-[10px] bg-black/30 px-2 py-0.5 rounded-full">
              {pastCount} past
            </span>
          )}
        </div>
        <p className="text-sm opacity-80 mb-3">No event set up yet for this week.</p>
        <button
          onClick={onCreate}
          className="w-full py-2 bg-white/15 hover:bg-white/25 rounded font-semibold text-sm"
        >
          Start {PLAY_DAY_LABELS[day]} event
        </button>
      </div>
    );
  }

  const registered = Object.keys(upcoming.players).length;
  const groupCount = upcoming.groups.length;

  return (
    <div className={`bg-gradient-to-br ${accent} rounded-2xl p-4`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-xs uppercase tracking-widest opacity-80">{PLAY_DAY_LABELS[day]} play</div>
          <div className="font-bold text-lg">{formatPlayDate(upcoming.date)}</div>
          <div className="text-xs opacity-80">{upcoming.courseName}</div>
        </div>
        <div className="text-right text-xs opacity-90">
          <div>
            <span className="font-bold">{registered}</span> registered
          </div>
          <div>
            <span className="font-bold">{groupCount}</span> groups
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => onRegister(upcoming.id)}
          className="py-2 bg-white/15 hover:bg-white/25 rounded font-semibold text-xs"
        >
          Sign up
        </button>
        <button
          onClick={() => onOpen(upcoming.id)}
          className="py-2 bg-white text-neutral-900 rounded font-semibold text-xs"
        >
          Manage
        </button>
        <button
          onClick={() => onLeaderboard(upcoming.id)}
          className="py-2 bg-white/15 hover:bg-white/25 rounded font-semibold text-xs"
        >
          Board
        </button>
      </div>
    </div>
  );
}

function EventRow({
  event,
  onOpen,
  onDelete,
}: {
  event: Tournament;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const players = Object.keys(event.players).length;
  return (
    <div className="bg-neutral-900 rounded-lg p-3 flex items-center justify-between">
      <button onClick={onOpen} className="flex-1 text-left">
        <div className="font-semibold text-sm">{event.name}</div>
        <div className="text-xs text-neutral-500">
          {formatPlayDate(event.date)} · {event.courseName} · {players} players
        </div>
      </button>
      <button onClick={onDelete} className="text-red-400 text-xs px-2 py-1">
        Delete
      </button>
    </div>
  );
}
