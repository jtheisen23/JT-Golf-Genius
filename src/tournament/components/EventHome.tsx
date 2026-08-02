import { useState } from 'react';
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
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  // No auto-write effects on mount: anyone can open this screen (organizer,
  // foursome members, spectators) and an effect that calls sync.save would
  // race with active scorekeepers and clobber their writes. CH is recomputed
  // on display via recomputeCh below; tee-time fields fall back to defaults
  // at the input level (08:00 / 12 min).

  // Course numbers for course-handicap math. Fall back to Geneva's values for
  // tournaments created before slope/rating were stored.
  const chSlope = tournament.slope ?? 132;
  const chRating = tournament.courseRating ?? 70;
  const chPar = tournament.holes.reduce((sum, h) => sum + h.par, 0);

  const courseHandicapFor = (index: number): number =>
    applyAllowance(courseHandicap(index, chSlope, chRating, chPar), tournament.handicapAllowance);

  const recomputeCh = (p: TourPlayer): number => courseHandicapFor(p.handicapIndex);

  const registered = Object.values(tournament.players);
  const handleRandomize = () => {
    if (registered.length === 0) return;
    const existingGroups = tournament.groups || [];
    const ok =
      existingGroups.length === 0 ||
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

  const handleUndoRandomize = () => {
    if (!confirm('Clear all groups? This returns the event to "no groups created".')) return;
    onSetGroups([]);
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

  /** Format "HH:MM" 24h as "h:MM AM/PM"; returns the original string if it doesn't parse. */
  const formatTeeTime = (t?: string): string => {
    if (!t) return '';
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return t;
    let h = parseInt(m[1], 10);
    const min = m[2];
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${min} ${ampm}`;
  };

  const totalPlayers = Object.keys(tournament.players || {}).length;
  const totalGroups = (tournament.groups || []).length;
  const totalScoresPosted = Object.values(tournament.scores || {}).reduce(
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
            {registered.map((p) => {
              const ch = recomputeCh(p);
              return (
              <div
                key={p.id}
                className="bg-neutral-900 rounded-lg px-3 py-2 flex items-center justify-between text-sm"
              >
                <div>
                  <div>{p.name}</div>
                  <div className="text-xs text-neutral-500">
                    Index {formatIndex(p.handicapIndex) || p.handicapIndex} · CH {ch < 0 ? `+${Math.abs(ch)}` : ch}
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
              );
            })}
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
                    const ch = courseHandicapFor(idx);
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
            <div className="flex gap-2">
              <button
                onClick={handleRandomize}
                className="flex-1 text-sm bg-emerald-700 text-white px-3 py-2.5 rounded font-semibold active:bg-emerald-800"
              >
                🎲 Randomize foursomes
              </button>
              {(tournament.groups || []).length > 0 && (
                <button
                  onClick={handleUndoRandomize}
                  className="text-sm bg-neutral-700 text-white px-3 py-2.5 rounded font-semibold active:bg-neutral-600"
                  title="Clear all groups — back to no groups created"
                >
                  ↶ Undo
                </button>
              )}
            </div>
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
        {(tournament.groups || []).map((rawG) => {
          // Firebase strips empty arrays — normalize so .map / .length never throws.
          const g = { ...rawG, playerIds: Array.isArray(rawG.playerIds) ? rawG.playerIds : [] };
          const playerNames = g.playerIds
            .map((id) => tournament.players[id]?.name || '?')
            .join(', ');
          const scored = Object.values(tournament.scores[g.id] || {}).reduce(
            (a, s) => a + Object.keys(s).length,
            0,
          );
          const expected = g.playerIds.length * (tournament.holes?.length ?? 18);
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
              undefined,
              tournament.handicapMode ?? 'off-the-low',
              tournament.id,
              g.id,
            );
            onUpdateGroup(g.id, { vegasGameCode: code });
            onLaunchVegas(code);
          };

          return (
            <div
              key={g.id}
              className="bg-neutral-900 rounded-lg p-3 active:bg-neutral-800"
            >
              <div className="flex items-center justify-between mb-1 gap-2">
                <div className="font-semibold flex items-baseline gap-2 flex-wrap">
                  <span>{g.name}</span>
                  {g.teeTime && (
                    <span className="text-xs font-medium text-emerald-400">
                      {formatTeeTime(g.teeTime)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingGroupId(g.id)}
                    className="text-xs bg-neutral-700 text-white px-2.5 py-1 rounded font-semibold active:bg-neutral-600"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={() => onOpenGroup(g.id)}
                    className="text-xs text-emerald-400"
                  >
                    Scorecard →
                  </button>
                </div>
              </div>
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

      {editingGroupId && (
        <EditGroupModal
          tournament={tournament}
          groupId={editingGroupId}
          onUpdateGroup={onUpdateGroup}
          onClose={() => setEditingGroupId(null)}
        />
      )}

      {movingPlayer && (() => {
        const allGroups = tournament.groups || [];
        const player = tournament.players[movingPlayer.playerId];
        const fromGroup = allGroups.find((g) => g.id === movingPlayer.fromGroupId);
        const otherGroups = allGroups.filter((g) => g.id !== movingPlayer.fromGroupId);
        if (!player || !fromGroup) return null;
        const fromIds = Array.isArray(fromGroup.playerIds) ? fromGroup.playerIds : [];

        const handleMove = (toGroupId: string) => {
          onUpdateGroup(movingPlayer.fromGroupId, {
            playerIds: fromIds.filter((id) => id !== movingPlayer.playerId),
          });
          const toGroup = allGroups.find((g) => g.id === toGroupId);
          const toIds = Array.isArray(toGroup?.playerIds) ? toGroup!.playerIds : [];
          onUpdateGroup(toGroupId, {
            playerIds: [...toIds, movingPlayer.playerId],
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
                  const ids = Array.isArray(g.playerIds) ? g.playerIds : [];
                  const names = ids
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

/**
 * Modal for editing a single group: name, tee time, and player roster.
 *
 * Pulled out into a separate component so it always reads `group` from the
 * latest `tournament` prop (avoiding stale-closure bugs from the IIFE pattern
 * we used previously). All mutations go through onUpdateGroup, which is
 * fed by the live `useTournament` mutator and reflects updates on next render.
 */
function EditGroupModal({
  tournament,
  groupId,
  onUpdateGroup,
  onClose,
}: {
  tournament: Tournament;
  groupId: string;
  onUpdateGroup: (id: string, patch: Partial<TourGroup>) => void;
  onClose: () => void;
}) {
  const groups = Array.isArray(tournament.groups) ? tournament.groups : [];
  const group = groups.find((g) => g.id === groupId);

  // If the group disappears (e.g. groups were cleared via Undo), close gracefully.
  if (!group) {
    return null;
  }

  const groupPlayerIds = Array.isArray(group.playerIds) ? group.playerIds : [];
  const inThisGroup = new Set(groupPlayerIds);
  const allRegistered = Object.values(tournament.players ?? {});

  const togglePlayer = (pid: string) => {
    // Re-resolve from `groups` each call — never trust captured arrays.
    const currentGroup = groups.find((g) => g.id === groupId);
    if (!currentGroup) return;
    const currentIds = Array.isArray(currentGroup.playerIds) ? currentGroup.playerIds : [];

    if (currentIds.includes(pid)) {
      onUpdateGroup(currentGroup.id, {
        playerIds: currentIds.filter((id) => id !== pid),
      });
      return;
    }
    // Adding: pull them from any other group first.
    const otherGroup = groups.find(
      (g) => g.id !== currentGroup.id && Array.isArray(g.playerIds) && g.playerIds.includes(pid),
    );
    if (otherGroup) {
      onUpdateGroup(otherGroup.id, {
        playerIds: (otherGroup.playerIds || []).filter((id) => id !== pid),
      });
    }
    onUpdateGroup(currentGroup.id, { playerIds: [...currentIds, pid] });
  };

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div className="bg-neutral-900 rounded-xl p-4 w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg">Edit {group.name}</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 text-xl leading-none px-2"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-3">
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
              Group name
            </div>
            <input
              value={group.name || ''}
              onChange={(e) => onUpdateGroup(group.id, { name: e.target.value })}
              className="w-full bg-neutral-800 border border-neutral-700 text-white px-2 py-1.5 rounded text-sm focus:outline-none focus:border-emerald-600"
            />
          </label>
          <label className="block">
            <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-0.5">
              Tee time
            </div>
            <input
              type="time"
              value={group.teeTime || ''}
              onChange={(e) => {
                // Empty -> '' (avoid Firebase rejecting undefined); non-empty -> "HH:MM"
                onUpdateGroup(group.id, { teeTime: e.target.value || '' });
              }}
              className="w-full bg-neutral-800 border border-neutral-700 text-white px-2 py-1.5 rounded text-sm focus:outline-none focus:border-emerald-600"
            />
          </label>
        </div>

        <div className="text-[10px] uppercase tracking-wider text-neutral-500 mb-1">
          Players ({groupPlayerIds.length} in group)
        </div>
        <div className="flex-1 overflow-y-auto space-y-1 mb-3">
          {allRegistered.length === 0 && (
            <p className="text-xs text-neutral-500">No registered players yet.</p>
          )}
          {allRegistered.map((p) => {
            const checked = inThisGroup.has(p.id);
            const otherGroupName = !checked
              ? groups.find(
                  (g) => g.id !== groupId && Array.isArray(g.playerIds) && g.playerIds.includes(p.id),
                )?.name
              : undefined;
            return (
              <label
                key={p.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded text-sm ${
                  checked ? 'bg-emerald-900/30' : 'bg-neutral-800/50'
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePlayer(p.id)}
                  className="accent-emerald-600"
                />
                <span className={checked ? 'text-white' : 'text-neutral-300'}>
                  {p.name || '(no name)'}
                </span>
                {otherGroupName && (
                  <span className="ml-auto text-[10px] text-amber-400">
                    in {otherGroupName} — adding will move
                  </span>
                )}
              </label>
            );
          })}
        </div>

        <button
          onClick={onClose}
          className="w-full py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold active:bg-emerald-700"
        >
          Done
        </button>
      </div>
    </div>
  );
}
