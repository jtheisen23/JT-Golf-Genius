import { useEffect, useState, useMemo } from 'react';
import { sync } from '../sync';
import { buildLeaderboard, formatToPar } from '../scoring';
import { isFuture, formatPlayDate } from '../dateUtils';
import type { Tournament } from '../types';

interface Props {
  onBack: () => void;
  onOpenLeaderboard: (id: string) => void;
}

type View = 'net' | 'gross' | 'stableford';

function loadPastEventsFromCache(): Tournament[] {
  return sync
    .listEventIds()
    .map((id) => sync.load(id))
    .filter((t): t is Tournament => t != null && !isFuture(t.date))
    .sort((a, b) => b.date.localeCompare(a.date));
}

function MiniLeaderboard({ tournament }: { tournament: Tournament }) {
  const [view, setView] = useState<View>(
    tournament.format === 'stableford' ? 'stableford' : 'net',
  );
  const entries = useMemo(() => buildLeaderboard(tournament), [tournament]);

  const sorted = useMemo(() => {
    const list = [...entries];
    if (view === 'gross') {
      return list.sort((a, b) => {
        if (a.thru === 0 && b.thru === 0) return 0;
        if (a.thru === 0) return 1;
        if (b.thru === 0) return -1;
        return a.grossToPar - b.grossToPar;
      });
    }
    if (view === 'stableford') {
      return list.sort((a, b) => b.stableford - a.stableford);
    }
    return list;
  }, [entries, view]);

  if (entries.length === 0) {
    return <p className="text-neutral-500 text-sm px-3 py-2">No scores posted.</p>;
  }

  return (
    <div>
      <div className="flex gap-1 text-xs mb-2 px-3">
        {(['net', 'gross', 'stableford'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-1 rounded uppercase tracking-wide ${
              view === v ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-400'
            }`}
          >
            {v}
          </button>
        ))}
      </div>
      <div className="space-y-0.5 px-1">
        {sorted.slice(0, 10).map((entry, i) => {
          const primary =
            view === 'stableford'
              ? `${entry.stableford}`
              : view === 'gross'
              ? formatToPar(entry.grossToPar)
              : formatToPar(entry.netToPar);
          return (
            <div
              key={entry.playerId}
              className="grid grid-cols-[24px_1fr_50px] gap-2 items-center px-2 py-1.5 bg-neutral-900 rounded"
            >
              <div className="text-xs text-neutral-500 font-semibold">{i + 1}</div>
              <div className="text-sm font-medium truncate">{entry.playerName}</div>
              <div
                className={`text-right text-sm font-bold ${
                  view !== 'stableford' && entry.thru > 0
                    ? (view === 'gross' ? entry.grossToPar : entry.netToPar) < 0
                      ? 'text-red-400'
                      : 'text-neutral-100'
                    : 'text-neutral-100'
                }`}
              >
                {entry.thru === 0 ? '—' : primary}
              </div>
            </div>
          );
        })}
        {sorted.length > 10 && (
          <p className="text-[10px] text-neutral-500 text-center mt-1">
            +{sorted.length - 10} more
          </p>
        )}
      </div>
    </div>
  );
}

export default function PastResults({ onBack, onOpenLeaderboard }: Props) {
  // Seed from cache so the page renders instantly with whatever the in-memory
  // sync has, then re-fetch from Firebase so a tournament whose scores were
  // just imported (or whose cache was stale) shows up after this mount.
  const [events, setEvents] = useState<Tournament[]>(() => loadPastEventsFromCache());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    sync.fetchAll()
      .then((all) => {
        if (cancelled) return;
        const fresh = all
          .filter((t) => !isFuture(t.date))
          .sort((a, b) => b.date.localeCompare(a.date));
        setEvents(fresh);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 pb-12">
      <header className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-neutral-800 p-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-neutral-400">
            ← Back
          </button>
          <div className="font-bold">Past Results</div>
          <div className="w-12" />
        </div>
      </header>

      <div className="p-3 space-y-3">
        {events.length === 0 && (
          <p className="text-center text-neutral-500 p-8">No past events yet.</p>
        )}

        {events.map((event) => {
          const playerCount = Object.keys(event.players).length;
          const isOpen = expanded.has(event.id);

          return (
            <div key={event.id} className="bg-neutral-900 rounded-xl overflow-hidden">
              <button
                onClick={() => toggle(event.id)}
                className="w-full text-left p-4 flex items-center justify-between"
              >
                <div>
                  <div className="font-bold">{event.name}</div>
                  <div className="text-sm text-neutral-400">
                    {event.courseName} &middot; {formatPlayDate(event.date)}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {playerCount} player{playerCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div className="text-neutral-500 text-lg">{isOpen ? '▾' : '▸'}</div>
              </button>

              {isOpen && (
                <div className="border-t border-neutral-800 py-3">
                  <MiniLeaderboard tournament={event} />
                  <div className="px-3 mt-3">
                    <button
                      onClick={() => onOpenLeaderboard(event.id)}
                      className="w-full py-2 bg-emerald-700 rounded-lg text-sm font-semibold"
                    >
                      View full leaderboard
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
