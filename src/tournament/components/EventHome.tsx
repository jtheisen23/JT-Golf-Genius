import { useEffect, useState } from 'react';
import type { Tournament, TourGroup, TourPlayer } from '../types';
import { randomizeGroups } from '../randomize';
import { PLAY_DAY_LABELS, formatPlayDate } from '../dateUtils';
import { applyAllowance, courseHandicap } from '../ghin';
import { createVegasGameFromTournament } from '../../hooks/vegasSync';
import { parseIndex, formatIndex } from '../../components/PlayerIndexInput';

interface Props {
  tournament: Tournament;
  onOpenGroup: (groupId: string) => void;
  onOpenLeaderboard: () => void;
  onOpenRegistration: () => void;
  onSetGroups: (groups: TourGroup[]) => void;
  onRemovePlayer: (id: string) => void;
  onUpdatePlayer: (id: string, patch: Partial<TourPlayer>) => void;
  onUpdateGroup: (id: string, patch: Partial<TourGroup>) => void;
  onUpdateMeta: (
    patch: Partial<Pick<Tournament, 'startTime' | 'teeTimeInterval'>>,
  ) => void;
  onLaunchVegas: (code: string) => void;
  onEditSetup: () => void;
  onExit: () => void;
}

export default function EventHome({
  tournament,
  onOpenGroup,
  onOpenLeaderboard,
  onOpenRegistration,
  onSetGroups,
  onRemovePlayer,
  onUpdatePlayer,
  onUpdateGroup,
  onUpdateMeta,
  onLaunchVegas,
  onEditSetup,
  onExit,
}: Props) {
  const [editingPlayer, setEditingPlayer] = useState<TourPlayer | null>(null);
  const [editName, setEditName] = useState('');
  const [editIndex, setEditIndex] = useState('');
  const [movingPlayer, setMovingPlayer] = useState<{ playerId: string; fromGroupId: string } | null>(null);
  // Recalculate CH for all players using current formula on mount
  useEffect(() => {
    for (const p of Object.values(tournament.players)) {
      const correctCh = applyAllowance(
        courseHandicap(p.handicapIndex, 132, 70, 68),
        tournament.handicapAllowance,
      );
      if (p.courseHandicap !== correctCh) {
        onUpdatePlayer(p.id, { courseHandicap: correctCh });
      }
    }
  }, [tournament.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Backfill tee-time fields on legacy events so the inputs reflect a real
  // saved value (and the user sees they're editable, not a hard-coded label).
  useEffect(() => {
    const patch: { startTime?: string; teeTimeInterval?: number } = {};
    if (tournament.startTime == null) patch.startTime = '08:00';
    if (tournament.teeTimeInterval == null) patch.teeTimeInterval = 12;
    if (Object.keys(patch).length > 0) onUpdateMeta(patch);
  }, [tournament.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const registered = Object.values(tournament.players);
  const handleRandomize = () => {
    if (registered.length === 0) return;
    const ok =
      tournament.groups.length === 0 ||
      confirm('Replace existing groups with a fresh random draw?');
    if (!ok) return;
    // Fall back to 08:00 / 12 min so events created before tee-time fields existed
    // still get tee times stamped on Randomize.
    onSetGroups(
      randomizeGroups(
        registered,
        4,
        'Group',
        tournament.startTime || '08:00',
        tournament.teeTimeInterval ?? 12,
      ),
    );
  };
  const base = `${window.location.origin}${window.location.pathname}`;
  const leaderboardUrl = `${base}#/t/${tournament.id}/leaderboard`;
  const registrationUrl = `${base}#/t/${tournament.id}/register`;

  const copy = async (url: string, label: string) => {
    try {
      await navigator.clipboard.writeText(url);
      alert(`${label} link copied`);
    } catch {
      /* clipboard unavailable */
    }
  };

  const totalPlayers = Object.keys(tournament.players).length;
  const totalGroups = tournament.groups.length;
  const totalScoresPosted = Object.values(tournament.scores).reduce(
    (acc, g) => acc + Object.values(g).reduce((a, s) => a + Object.keys(s).length, 0),
    0,
  );

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-4 pb-8">
      <header className="mb-4 flex items-start justify-between">
        <button onClick={onExit} className="text-sm text-neutral-400">
          ← All events
        </button>
        <button onClick={onEditSetup} className="text-sm text-emerald-400">
          Edit setup
        </button>
      </header>

      <div className="mb-6">
        <div className="flex items-center gap-2">
          <div className="text-xs text-neutral-500 uppercase tracking-widest">
            {tournament.playDay ? `${PLAY_DAY_LABELS[tournament.playDay]} play` : 'Tournament'}
          </div>
          {tournament.playDay && (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                tournament.playDay === 'friday'
                  ? 'bg-sky-700 text-sky-100'
                  : 'bg-amber-700 text-amber-100'
              }`}
            >
              {PLAY_DAY_LABELS[tournament.playDay].toUpperCase()}
            </span>
          )}
        </div>
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <p className="text-sm text-neutral-400">
          {tournament.courseName} · {formatPlayDate(tournament.date)}
        </p>
        <div className="mt-2 flex gap-3 text-xs text-neutral-500">
          <span>{totalPlayers} players</span>
          <span>{totalGroups} groups</span>
          <span>{totalScoresPosted} scores posted</span>
        </div>
      </div>

      <button
        onClick={onOpenLeaderboard}
        className="w-full py-3 bg-emerald-600 text-white font-bold rounded-lg mb-2"
      >
        View live leaderboard
      </button>
      <button
        onClick={onOpenRegistration}
        className="w-full py-3 bg-sky-700 text-white font-bold rounded-lg mb-2"
      >
        Open sign-up page
      </button>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <button
          onClick={() => copy(registrationUrl, 'Sign-up')}
          className="py-2 bg-neutral-900 text-neutral-300 text-xs rounded-lg"
        >
          Copy sign-up link
        </button>
        <button
          onClick={() => copy(leaderboardUrl, 'Leaderboard')}
          className="py-2 bg-neutral-900 text-neutral-300 text-xs rounded-lg"
        >
          Copy leaderboard link
        </button>
      </div>

      <div className="mb-6">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-2">
          Registered ({registered.length})
        </h2>
        {registered.length === 0 ? (
          <p className="text-sm text-neutral-500">No registrations yet.</p>
        ) : (
          <div className="space-y-1">
            {registered.map((p) => (
              <div
                key={p.id}
                className="bg-neutral-900 rounded-lg px-3 py-2 flex items-center justify-between text-sm"
              >
                <div>
                  <div>{p.name}</div>
                  <div className="text-xs text-neutral-500">
                    Index {formatIndex(p.handicapIndex) || p.handicapIndex} · CH {p.courseHandicap < 0 ? `+${Math.abs(p.courseHandicap)}` : p.courseHandicap}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditingPlayer(p);
                      setEditName(p.name);
                      setEditIndex(formatIndex(p.handicapIndex) || String(p.handicapIndex));
                    }}
                    className="text-xs text-emerald-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${p.name}?`)) onRemovePlayer(p.id);
                    }}
                    className="text-xs text-neutral-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {editingPlayer && (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-xl p-4 w-full max-w-sm space-y-3">
              <h3 className="font-bold text-lg">Edit player</h3>
              <label className="block">
                <div className="text-xs text-neutral-400 uppercase mb-1">Name</div>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
                />
              </label>
              <label className="block">
                <div className="text-xs text-neutral-400 uppercase mb-1">Handicap Index</div>
                <input
                  type="text"
                  value={editIndex}
                  onChange={(e) => setEditIndex(e.target.value)}
                  placeholder="e.g. 12.4 or +2.3"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full bg-neutral-800 border border-neutral-700 text-white px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-emerald-600"
                />
              </label>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setEditingPlayer(null)}
                  className="flex-1 py-2 bg-neutral-800 text-neutral-300 rounded-lg text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const idx = parseIndex(editIndex);
                    const ch = applyAllowance(
                      courseHandicap(idx, 132, 70, 68),
                      tournament.handicapAllowance,
                    );
                    onUpdatePlayer(editingPlayer.id, {
                      name: editName.trim() || editingPlayer.name,
                      handicapIndex: idx,
                      courseHandicap: ch,
                    });
                    setEditingPlayer(null);
                  }}
                  className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mb-2">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500 mb-2">Groups</h2>
        {registered.length > 0 && (
          <div className="bg-neutral-900 border border-neutral-800 rounded-lg p-3 mb-2">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-2">
              Tee-time settings — tap to change
            </div>
            <div className="flex items-end gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[11px] text-neutral-400 block mb-0.5">
                  First tee time
                </label>
                <input
                  type="time"
                  value={tournament.startTime || '08:00'}
                  onChange={(e) => onUpdateMeta({ startTime: e.target.value })}
                  className="w-full bg-neutral-950 border border-emerald-700/40 text-white px-2 py-2 rounded text-sm font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="w-28">
                <label className="text-[11px] text-neutral-400 block mb-0.5">
                  Interval (min)
                </label>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={tournament.teeTimeInterval ?? 12}
                  onChange={(e) =>
                    onUpdateMeta({
                      teeTimeInterval: Math.max(1, Number(e.target.value) || 12),
                    })
                  }
                  className="w-full bg-neutral-950 border border-emerald-700/40 text-white px-2 py-2 rounded text-sm font-semibold focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
            <button
              onClick={handleRandomize}
              className="w-full text-sm bg-emerald-700 text-white px-3 py-2.5 rounded font-semibold active:bg-emerald-800"
            >
              🎲 Randomize foursomes
            </button>
          </div>
        )}
      </div>
      {tournament.groups.length === 0 && (
        <p className="text-sm text-neutral-500">
          {registered.length === 0
            ? 'No registrations yet. Share the sign-up link above.'
            : `${registered.length} registered. Tap Randomize to draw foursomes.`}
        </p>
      )}
      <div className="space-y-2">
        {tournament.groups.map((g) => {
          const playerNames = g.playerIds
            .map((id) => tournament.players[id]?.name || '?')
            .join(', ');
          const scored = Object.values(tournament.scores[g.id] || {}).reduce(
            (a, s) => a + Object.keys(s).length,
            0,
          );
          const expected = g.playerIds.length * tournament.holes.length;
          const hasVegas = !!g.vegasGameCode;
          const canLaunchVegas = g.playerIds.length >= 4;

          const handleVegas = async (e: React.MouseEvent) => {
            e.stopPropagation();
            if (hasVegas) {
              // Join existing game
              onLaunchVegas(g.vegasGameCode!);
              return;
            }
            if (!canLaunchVegas) return;
            const groupPlayers = g.playerIds
              .map((id) => tournament.players[id])
              .filter(Boolean);
            const code = await createVegasGameFromTournament(
              groupPlayers,
              tournament.holes,
              tournament.courseName,
            );
            onUpdateGroup(g.id, { vegasGameCode: code });
            onLaunchVegas(code);
          };

          return (
            <div
              key={g.id}
              className="bg-neutral-900 rounded-lg p-3 active:bg-neutral-800"
            >
              <div className="flex items-center justify-between mb-1">
                <div className="font-semibold">{g.name}</div>
                <button
                  onClick={() => onOpenGroup(g.id)}
                  className="text-xs text-emerald-400"
                >
                  Scorecard →
                </button>
              </div>
              {g.teeTime && (
                <div className="text-xs text-neutral-500 mb-1">Tee {g.teeTime}</div>
              )}
              <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                {g.playerIds.map((pid) => {
                  const player = tournament.players[pid];
                  if (!player) return null;
                  return (
                    <button
                      key={pid}
                      onClick={() => setMovingPlayer({ playerId: pid, fromGroupId: g.id })}
                      className="text-xs text-neutral-400 underline decoration-neutral-700"
                    >
                      {player.name}
                    </button>
                  );
                })}
                {g.playerIds.length === 0 && (
                  <span className="text-xs text-neutral-500">No players</span>
                )}
              </div>
              {canLaunchVegas && (
                <button
                  onClick={handleVegas}
                  className={`mt-2 w-full py-2 rounded-lg text-xs font-semibold active:scale-95 transition-all duration-100 ${
                    hasVegas
                      ? 'bg-amber-700 text-amber-100 active:bg-amber-800'
                      : 'bg-red-700 text-white active:bg-red-800'
                  }`}
                >
                  {hasVegas ? `Join Vegas Game (${g.vegasGameCode})` : '🎲 Start Vegas Game'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {movingPlayer && (() => {
        const player = tournament.players[movingPlayer.playerId];
        const fromGroup = tournament.groups.find((g) => g.id === movingPlayer.fromGroupId);
        const otherGroups = tournament.groups.filter((g) => g.id !== movingPlayer.fromGroupId);
        if (!player || !fromGroup) return null;

        const handleMove = (toGroupId: string) => {
          // Remove from current group
          onUpdateGroup(movingPlayer.fromGroupId, {
            playerIds: fromGroup.playerIds.filter((id) => id !== movingPlayer.playerId),
          });
          // Add to target group
          const toGroup = tournament.groups.find((g) => g.id === toGroupId)!;
          onUpdateGroup(toGroupId, {
            playerIds: [...toGroup.playerIds, movingPlayer.playerId],
          });
          setMovingPlayer(null);
        };

        return (
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
            <div className="bg-neutral-900 rounded-xl p-4 w-full max-w-sm">
              <h3 className="font-bold text-lg mb-1">Move {player.name}</h3>
              <p className="text-xs text-neutral-500 mb-3">
                Currently in {fromGroup.name}. Tap a group to move them.
              </p>
              <div className="space-y-2">
                {otherGroups.map((g) => {
                  const names = g.playerIds
                    .map((id) => tournament.players[id]?.name || '?')
                    .join(', ');
                  return (
                    <button
                      key={g.id}
                      onClick={() => handleMove(g.id)}
                      className="w-full text-left bg-neutral-800 rounded-lg p-3 active:bg-neutral-700"
                    >
                      <div className="font-semibold text-sm">{g.name}</div>
                      <div className="text-xs text-neutral-500">{names || 'Empty'}</div>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => setMovingPlayer(null)}
                className="w-full mt-3 py-2 bg-neutral-800 text-neutral-300 rounded-lg text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
