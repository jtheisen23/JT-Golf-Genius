import { useEffect, useMemo, useState } from 'react';
import type { Tournament } from '../types';
import { buildLeaderboard, formatToPar } from '../scoring';
import { loadVegasGame, subscribeVegasGame, type VegasGameState } from '../../hooks/vegasSync';
import { calculatePlayerMoney } from '../../utils/scoring';

interface Props {
  tournament: Tournament;
  onBack: () => void;
}

type View = 'net' | 'gross' | 'stableford';

export default function Leaderboard({ tournament, onBack }: Props) {
  const [view, setView] = useState<View>(tournament.format === 'stableford' ? 'stableford' : 'net');
  // Map groupId → VegasGameState for groups with active Vegas games
  const [vegasStates, setVegasStates] = useState<Record<string, VegasGameState>>({});

  // Build playerId → groupId lookup
  const playerGroupMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const g of tournament.groups) {
      for (const pid of g.playerIds) map[pid] = g.id;
    }
    return map;
  }, [tournament.groups]);

  // Subscribe to Vegas games for live updates
  useEffect(() => {
    const unsubs: (() => void)[] = [];
    for (const g of tournament.groups) {
      if (!g.vegasGameCode) continue;
      const groupId = g.id;
      const code = g.vegasGameCode;
      // Initial load
      loadVegasGame(code).then((state) => {
        if (state) setVegasStates((prev) => ({ ...prev, [groupId]: state }));
      });
      // Live subscription
      unsubs.push(
        subscribeVegasGame(code, (state) => {
          setVegasStates((prev) => ({ ...prev, [groupId]: state }));
        }),
      );
    }
    return () => unsubs.forEach((u) => u());
  }, [tournament.groups]);

  const hasVegas = Object.keys(vegasStates).length > 0;

  // Build Vegas scores map: groupId → playerId → holeNumber → gross score
  const vegasScoresMap = useMemo(() => {
    const map: Record<string, Record<string, Record<number, number>>> = {};
    for (const [groupId, state] of Object.entries(vegasStates)) {
      map[groupId] = state.scores || {};
    }
    return map;
  }, [vegasStates]);

  const entries = useMemo(
    () => buildLeaderboard(tournament, hasVegas ? vegasScoresMap : undefined),
    [tournament, vegasScoresMap, hasVegas],
  );

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

  const shareUrl = `${window.location.origin}${window.location.pathname}#/t/${tournament.id}/leaderboard`;

  const handleShare = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: tournament.name, url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
        alert('Leaderboard link copied');
      }
    } catch {
      /* user cancelled or share failed */
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 pb-12">
      <header className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-neutral-800 p-3">
        <div className="flex items-center justify-between mb-2">
          <button onClick={onBack} className="text-sm text-neutral-400">
            ← Back
          </button>
          <div className="text-center">
            <div className="text-xs text-neutral-500 uppercase tracking-widest">Leaderboard</div>
            <div className="font-bold">{tournament.name}</div>
          </div>
          <button onClick={handleShare} className="text-sm text-emerald-400">
            Share
          </button>
        </div>
        <div className="flex gap-1 text-xs">
          {(['net', 'gross', 'stableford'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`flex-1 py-1.5 rounded uppercase tracking-wide ${
                view === v ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-neutral-400'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
      </header>

      <div className="p-2">
        {sorted.length === 0 && (
          <p className="text-center text-neutral-500 p-8">No players yet.</p>
        )}
        <div className="space-y-1">
          <div className={`grid ${hasVegas ? 'grid-cols-[32px_1fr_36px_50px_50px_36px_50px]' : 'grid-cols-[32px_1fr_48px_60px_60px]'} gap-1 px-3 py-1 text-[10px] uppercase tracking-wider text-neutral-500`}>
            <div>Pos</div>
            <div>Player</div>
            <div className="text-center">Thru</div>
            <div className="text-right">
              {view === 'stableford' ? 'Pts' : view === 'gross' ? 'Gross' : 'Net'}
            </div>
            <div className="text-right">
              {view === 'stableford' ? 'Thru' : 'Total'}
            </div>
            {hasVegas && <div className="text-center">Hole</div>}
            {hasVegas && <div className="text-right">Vegas</div>}
          </div>
          {sorted.map((entry, i) => {
            const pos =
              entry.thru === 0
                ? '—'
                : view !== 'stableford' && i > 0 && sameKey(entry, sorted[i - 1], view)
                ? 'T' + (getPos(sorted, i, view) ?? i + 1)
                : entry.position || i + 1;
            const primary =
              view === 'stableford'
                ? `${entry.stableford}`
                : view === 'gross'
                ? formatToPar(entry.grossToPar)
                : formatToPar(entry.netToPar);
            const secondary =
              view === 'stableford' ? `${entry.thru}` : view === 'gross' ? entry.grossTotal : entry.netTotal;
            // Vegas data for this player
            const groupId = playerGroupMap[entry.playerId];
            const vegasState = groupId ? vegasStates[groupId] : undefined;
            const vegasHole = vegasState?.currentHole;
            const vegasMoney = vegasState
              ? calculatePlayerMoney(vegasState, entry.playerId)
              : null;

            return (
              <div
                key={entry.playerId}
                className={`grid ${hasVegas ? 'grid-cols-[32px_1fr_36px_50px_50px_36px_50px]' : 'grid-cols-[32px_1fr_48px_60px_60px]'} gap-1 items-center px-3 py-2 bg-neutral-900 rounded-md`}
              >
                <div className="text-sm text-neutral-400 font-semibold">{pos}</div>
                <div>
                  <div className="font-semibold text-sm">{entry.playerName}</div>
                  <div className="text-[10px] text-neutral-500">{entry.groupName}</div>
                </div>
                <div className="text-center text-sm text-neutral-400">
                  {entry.thru || '—'}
                </div>
                <div
                  className={`text-right font-bold ${
                    view !== 'stableford' && entry.thru > 0
                      ? (view === 'gross' ? entry.grossToPar : entry.netToPar) < 0
                        ? 'text-red-400'
                        : 'text-neutral-100'
                      : 'text-neutral-100'
                  }`}
                >
                  {entry.thru === 0 ? '—' : primary}
                </div>
                <div className="text-right text-sm text-neutral-400">
                  {entry.thru === 0 ? '—' : secondary}
                </div>
                {hasVegas && (
                  <div className="text-center text-sm text-neutral-400">
                    {vegasHole ?? '—'}
                  </div>
                )}
                {hasVegas && (
                  <div
                    className={`text-right text-sm font-semibold ${
                      vegasMoney == null
                        ? 'text-neutral-500'
                        : vegasMoney > 0
                        ? 'text-emerald-400'
                        : vegasMoney < 0
                        ? 'text-red-400'
                        : 'text-neutral-400'
                    }`}
                  >
                    {vegasMoney == null
                      ? '—'
                      : `${vegasMoney >= 0 ? '+' : '-'}$${Math.abs(vegasMoney).toFixed(2)}`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {sorted.length > 0 && (
          <p className="text-[10px] text-neutral-600 text-center mt-4">
            Updates live as groups post scores.
          </p>
        )}
      </div>
    </div>
  );
}

function sameKey(
  a: ReturnType<typeof buildLeaderboard>[number],
  b: ReturnType<typeof buildLeaderboard>[number],
  view: View,
): boolean {
  if (view === 'gross') return a.grossToPar === b.grossToPar && a.thru > 0 && b.thru > 0;
  if (view === 'stableford') return a.stableford === b.stableford;
  return a.netToPar === b.netToPar && a.thru > 0 && b.thru > 0;
}

function getPos(
  list: ReturnType<typeof buildLeaderboard>,
  index: number,
  view: View,
): number | null {
  for (let i = index; i >= 0; i--) {
    if (i === 0 || !sameKey(list[i], list[i - 1], view)) return i + 1;
  }
  return null;
}
