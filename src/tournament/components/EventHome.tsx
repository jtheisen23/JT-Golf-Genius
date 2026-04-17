import { useEffect, useState } from 'react';
import type { Tournament, TourGroup, TourPlayer } from '../types';
import { randomizeGroups } from '../randomize';
import { PLAY_DAY_LABELS, formatPlayDate } from '../dateUtils';
import { applyAllowance, courseHandicap } from '../ghin';
import { createVegasGameFromTournament } from '../../hooks/vegasSync';

interface Props {
  tournament: Tournament;
  onOpenGroup: (groupId: string) => void;
  onOpenLeaderboard: () => void;
  onOpenRegistration: () => void;
  onSetGroups: (groups: TourGroup[]) => void;
  onRemovePlayer: (id: string) => void;
  onUpdatePlayer: (id: string, patch: Partial<TourPlayer>) => void;
  onUpdateGroup: (id: string, patch: Partial<TourGroup>) => void;
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
  onLaunchVegas,
  onEditSetup,
  onExit,
}: Props) {
  const [editingPlayer, setEditingPlayer] = useState<TourPlayer | null>(null);
  const [editName, setEditName] = useState('');
  const [editIndex, setEditIndex] = useState('');
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

  const registered = Object.values(tournament.players);
  const handleRandomize = () => {
    if (registered.length === 0) return;
    const ok =
      tournament.groups.length === 0 ||
      confirm('Replace existing groups with a fresh random draw?');
    if (!ok) return;
    onSetGroups(randomizeGroups(registered, 4));
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
                    Index {p.handicapIndex} · CH {p.courseHandicap}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditingPlayer(p);
                      setEditName(p.name);
                      setEditIndex(String(p.handicapIndex));
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
                  value={editIndex}
                  onChange={(e) => setEditIndex(e.target.value)}
                  inputMode="decimal"
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
                    const idx = Number(editIndex) || 0;
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

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-widest text-neutral-500">Groups</h2>
        {registered.length > 0 && (
          <button
            onClick={handleRandomize}
            className="text-xs bg-emerald-700 text-white px-3 py-1.5 rounded font-semibold"
          >
            🎲 Randomize foursomes
          </button>
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
              <button
                onClick={() => onOpenGroup(g.id)}
                className="w-full text-left flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold">{g.name}</div>
                  <div className="text-xs text-neutral-500">{playerNames || 'No players'}</div>
                  {g.teeTime && (
                    <div className="text-xs text-neutral-500">Tee {g.teeTime}</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-500">Progress</div>
                  <div className="font-mono text-sm">
                    {scored}/{expected}
                  </div>
                </div>
              </button>
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
    </div>
  );
}
