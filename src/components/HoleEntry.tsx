import { useState } from 'react';
import { Player, Match, HoleSetup, Multiplier, HandicapMode } from '../types';
import { getNetScore } from '../utils/scoring';
import { getStrokesOnHole } from '../utils/handicap';

interface Props {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>;
  currentHole: number;
  onSetCurrentHole: (hole: number) => void;
  onSetScore: (playerId: string, holeNumber: number, grossScore: number) => void;
  onClearScore: (playerId: string, holeNumber: number) => void;
  onShowScoreboard: () => void;
  onShowScorecard: () => void;
  getMatchResultsForHole: (match: Match, holeNumber: number) => { team1Vegas: number; team2Vegas: number; points: number } | null;
  getActiveMatches: () => Match[];
  getCurrentRotation: () => number;
  getMultiplier: (matchId: string, holeNumber: number) => Multiplier;
  getMultiplierValue: (m: Multiplier) => number;
  onSetMultiplier: (matchId: string, holeNumber: number, value: Multiplier) => void;
  onUpdatePlayer: (id: string, field: keyof Player, value: string | number) => void;
  handicapMode: HandicapMode;
  onSetHandicapMode: (mode: HandicapMode) => void;
  onRecalculateStrokes: () => void;
  onAutoGenerateMatches: () => void;
  onAddMatch: (team1: [string, string], team2: [string, string], rotation: number) => void;
  onRemoveMatch: (matchId: string) => void;
  onSetMatches: (matches: Match[]) => void;
}

export default function HoleEntry({
  players,
  holes,
  scores,
  currentHole,
  onSetCurrentHole,
  onSetScore,
  onClearScore,
  onShowScoreboard,
  onShowScorecard,
  getMatchResultsForHole,
  getActiveMatches,
  getCurrentRotation,
  matches,
  getMultiplier,
  getMultiplierValue,
  onSetMultiplier,
  onUpdatePlayer,
  handicapMode,
  onSetHandicapMode,
  onRecalculateStrokes,
  onAutoGenerateMatches,
  onAddMatch,
  onRemoveMatch,
  onSetMatches,
}: Props) {
  const [showEditPlayers, setShowEditPlayers] = useState(false);
  const [showEditMatches, setShowEditMatches] = useState(false);
  const [newMatchRotation, setNewMatchRotation] = useState(1);
  const [newMatchTeam1, setNewMatchTeam1] = useState<[string, string]>(['', '']);
  const [newMatchTeam2, setNewMatchTeam2] = useState<[string, string]>(['', '']);
  const hole = holes.find((h) => h.number === currentHole)!;
  const activeMatches = getActiveMatches();
  const rotation = getCurrentRotation();

  // Get unique players involved in active matches
  const activePlayerIds = new Set<string>();
  activeMatches.forEach((m) => {
    m.team1.forEach((id) => activePlayerIds.add(id));
    m.team2.forEach((id) => activePlayerIds.add(id));
  });

  const handleScoreChange = (playerId: string, value: string) => {
    const num = parseInt(value);
    if (value === '' || isNaN(num)) {
      onClearScore(playerId, currentHole);
    } else if (num >= 1 && num <= 15) {
      onSetScore(playerId, currentHole, num);
    }
  };

  const allScoresEntered = players
    .filter((p) => activePlayerIds.has(p.id))
    .every((p) => scores[p.id]?.[currentHole] != null);

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      {/* Edit Players Modal */}
      {showEditPlayers && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center">
          <div className="bg-neutral-900 w-full max-w-lg rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Edit Players</h2>
              <button
                onClick={() => {
                  onRecalculateStrokes();
                  setShowEditPlayers(false);
                }}
                className="text-red-500 font-semibold text-sm"
              >
                Done
              </button>
            </div>

            {players.map((player, idx) => (
              <div key={player.id} className="bg-neutral-800 rounded-xl p-3 mb-3">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-red-500 font-bold">#{idx + 1}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-neutral-400 mb-1 block">Name</label>
                    <input
                      type="text"
                      value={player.name}
                      onChange={(e) => onUpdatePlayer(player.id, 'name', e.target.value)}
                      className="w-full bg-neutral-700 text-white rounded-lg px-3 py-2 text-sm border border-neutral-600 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-neutral-400 mb-1 block">Handicap</label>
                    <input
                      type="number"
                      value={player.handicap || ''}
                      onChange={(e) =>
                        onUpdatePlayer(player.id, 'handicap', parseInt(e.target.value) || 0)
                      }
                      placeholder="0"
                      className="w-full bg-neutral-700 text-white rounded-lg px-3 py-2 text-sm border border-neutral-600 focus:border-red-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="text-xs text-neutral-500 mt-2">
                  Strokes received: {player.strokesReceived}
                </div>
              </div>
            ))}

            <div className="mt-4">
              <label className="text-xs text-neutral-400 mb-2 block">Handicap Mode</label>
              <div className="flex gap-1 bg-neutral-800 rounded-lg p-1">
                <button
                  onClick={() => {
                    onSetHandicapMode('off-the-low');
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    handicapMode === 'off-the-low'
                      ? 'bg-red-600 text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Off the Low
                </button>
                <button
                  onClick={() => {
                    onSetHandicapMode('full');
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                    handicapMode === 'full'
                      ? 'bg-red-600 text-white'
                      : 'text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Full Handicap
                </button>
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                {handicapMode === 'off-the-low'
                  ? 'Strokes calculated relative to the lowest handicap'
                  : 'Each player receives their full handicap strokes'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Edit Matches Modal */}
      {showEditMatches && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center">
          <div className="bg-neutral-900 w-full max-w-lg rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Edit Matches</h2>
              <button
                onClick={() => setShowEditMatches(false)}
                className="text-red-500 font-semibold text-sm"
              >
                Done
              </button>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => {
                  onSetMatches([]);
                  onAutoGenerateMatches();
                }}
                className="flex-1 bg-neutral-800 border border-neutral-700 text-neutral-200 py-2 rounded-lg text-sm font-semibold"
              >
                Auto-Generate
              </button>
            </div>

            {[1, 2, 3].map((rot) => {
              const rotMatches = matches.filter((m) => m.rotation === rot);
              return (
                <div key={rot} className="mb-4">
                  <h3 className="text-red-500 font-semibold text-sm mb-2">
                    Rotation {rot} (Holes {(rot - 1) * 6 + 1}-{rot * 6})
                  </h3>
                  {rotMatches.length === 0 && (
                    <p className="text-neutral-500 text-xs mb-2">No matches</p>
                  )}
                  {rotMatches.map((match) => {
                    const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '?');
                    const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '?');
                    return (
                      <div key={match.id} className="flex items-center justify-between bg-neutral-800 rounded-lg p-2.5 mb-1.5">
                        <span className="text-xs text-white">
                          <span className="text-red-400">{t1.join(' & ')}</span>
                          <span className="text-neutral-400 mx-1.5">vs</span>
                          <span className="text-orange-300">{t2.join(' & ')}</span>
                        </span>
                        <button
                          onClick={() => onRemoveMatch(match.id)}
                          className="text-red-400 text-xs ml-2"
                        >
                          X
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* Add custom match */}
            <div className="bg-neutral-800 rounded-xl p-3 mt-2">
              <h3 className="text-neutral-300 font-semibold mb-2 text-sm">Add Match</h3>
              <div className="mb-2">
                <label className="text-xs text-neutral-500">Rotation</label>
                <select
                  value={newMatchRotation}
                  onChange={(e) => setNewMatchRotation(parseInt(e.target.value))}
                  className="w-full bg-neutral-700 text-white rounded px-2 py-1 text-sm border border-neutral-600"
                >
                  <option value={1}>1 (Holes 1-6)</option>
                  <option value={2}>2 (Holes 7-12)</option>
                  <option value={3}>3 (Holes 13-18)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-2">
                <div>
                  <label className="text-xs text-red-400">Team 1</label>
                  {[0, 1].map((i) => (
                    <select
                      key={i}
                      value={newMatchTeam1[i]}
                      onChange={(e) => {
                        const updated = [...newMatchTeam1] as [string, string];
                        updated[i] = e.target.value;
                        setNewMatchTeam1(updated);
                      }}
                      className="w-full bg-neutral-700 text-white rounded px-2 py-1 text-sm border border-neutral-600 mb-1"
                    >
                      <option value="">Select</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name || `Player ${players.indexOf(p) + 1}`}</option>
                      ))}
                    </select>
                  ))}
                </div>
                <div>
                  <label className="text-xs text-orange-400">Team 2</label>
                  {[0, 1].map((i) => (
                    <select
                      key={i}
                      value={newMatchTeam2[i]}
                      onChange={(e) => {
                        const updated = [...newMatchTeam2] as [string, string];
                        updated[i] = e.target.value;
                        setNewMatchTeam2(updated);
                      }}
                      className="w-full bg-neutral-700 text-white rounded px-2 py-1 text-sm border border-neutral-600 mb-1"
                    >
                      <option value="">Select</option>
                      {players.map((p) => (
                        <option key={p.id} value={p.id}>{p.name || `Player ${players.indexOf(p) + 1}`}</option>
                      ))}
                    </select>
                  ))}
                </div>
              </div>
              <button
                onClick={() => {
                  if (newMatchTeam1[0] && newMatchTeam1[1] && newMatchTeam2[0] && newMatchTeam2[1]) {
                    onAddMatch(newMatchTeam1, newMatchTeam2, newMatchRotation);
                    setNewMatchTeam1(['', '']);
                    setNewMatchTeam2(['', '']);
                  }
                }}
                className="w-full bg-neutral-700 text-white py-2 rounded-lg text-sm"
              >
                Add Match
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={onShowScoreboard}
            className="text-red-500 text-sm font-medium"
          >
            Scoreboard
          </button>
          <button
            onClick={onShowScorecard}
            className="text-red-500 text-sm font-medium"
          >
            Card
          </button>
        </div>
        <h1 className="text-xl font-bold text-red-500">Hole {currentHole}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowEditMatches(true)}
            className="text-yellow-400 text-sm font-medium"
          >
            Teams
          </button>
          <button
            onClick={() => setShowEditPlayers(true)}
            className="text-yellow-400 text-sm font-medium"
          >
            Edit
          </button>
          <div className="text-sm text-neutral-400">
            Par {hole.par} | R{rotation}
          </div>
        </div>
      </div>

      {/* Hole navigation */}
      <div className="flex items-center justify-center gap-2 mb-6">
        <button
          onClick={() => onSetCurrentHole(Math.max(1, currentHole - 1))}
          disabled={currentHole === 1}
          className="bg-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 text-white w-10 h-10 rounded-lg font-bold text-lg"
        >
          &lt;
        </button>
        <div className="flex gap-1 overflow-x-auto px-2">
          {holes.map((h) => (
            <button
              key={h.number}
              onClick={() => onSetCurrentHole(h.number)}
              className={`w-8 h-8 rounded-md text-xs font-medium flex-shrink-0 ${
                h.number === currentHole
                  ? 'bg-red-600 text-white'
                  : players.every((p) => !activePlayerIds.has(p.id) || scores[p.id]?.[h.number] != null)
                    ? 'bg-neutral-700 text-neutral-300'
                    : 'bg-neutral-900 text-neutral-500'
              }`}
            >
              {h.number}
            </button>
          ))}
        </div>
        <button
          onClick={() => onSetCurrentHole(Math.min(18, currentHole + 1))}
          disabled={currentHole === 18}
          className="bg-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 text-white w-10 h-10 rounded-lg font-bold text-lg"
        >
          &gt;
        </button>
      </div>

      {/* Score entry */}
      <div className="space-y-3 mb-6">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Enter Gross Scores</h2>
        {players
          .filter((p) => activePlayerIds.has(p.id))
          .map((player) => {
            const strokes = getStrokesOnHole(player.strokesReceived, hole.handicapRating);
            const gross = scores[player.id]?.[currentHole];
            const net = gross != null ? getNetScore(gross, player.strokesReceived, hole.handicapRating) : null;

            return (
              <div key={player.id} className="bg-neutral-900 rounded-xl p-3 flex items-center gap-3">
                <div className="flex-1">
                  <div className="text-white font-medium text-sm">{player.name}</div>
                  <div className="text-xs text-neutral-500">
                    {strokes > 0 ? (
                      <span className="text-yellow-400">{strokes} stroke{strokes > 1 ? 's' : ''}</span>
                    ) : (
                      'No strokes'
                    )}
                    {net != null && (
                      <span className="ml-2 text-neutral-400">Net: {net}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      const current = scores[player.id]?.[currentHole] || hole.par;
                      if (current > 1) handleScoreChange(player.id, String(current - 1));
                    }}
                    className="bg-neutral-800 text-white w-9 h-9 rounded-lg text-lg font-bold"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={scores[player.id]?.[currentHole] ?? ''}
                    onChange={(e) => handleScoreChange(player.id, e.target.value)}
                    placeholder={String(hole.par)}
                    className="w-14 h-9 bg-neutral-800 text-white text-center rounded-lg text-lg font-bold border border-neutral-700 focus:border-red-500 focus:outline-none"
                  />
                  <button
                    onClick={() => {
                      const current = scores[player.id]?.[currentHole] || hole.par;
                      if (current < 15) handleScoreChange(player.id, String(current + 1));
                    }}
                    className="bg-neutral-800 text-white w-9 h-9 rounded-lg text-lg font-bold"
                  >
                    +
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      {/* Match results for this hole */}
      {allScoresEntered && (
        <div className="space-y-3 mb-6">
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">This Hole</h2>
          {activeMatches.map((match) => {
            const result = getMatchResultsForHole(match, currentHole);
            if (!result) return null;
            const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '?');
            const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '?');
            const winner = result.points > 0 ? 'team1' : result.points < 0 ? 'team2' : 'tie';
            const currentMult = getMultiplier(match.id, currentHole);
            const multValue = getMultiplierValue(currentMult);
            const multipliedPoints = result.points * multValue;

            // Determine next escalation step
            const nextStep: { label: string; value: Multiplier } | null =
              currentMult === 'none' ? { label: 'Press (x2)', value: 'press' } :
              currentMult === 'press' ? { label: 'Roll (x4)', value: 'roll' } :
              currentMult === 'roll' ? { label: 'Re-Roll (x8)', value: 're-roll' } :
              null;

            return (
              <div key={match.id} className="bg-neutral-900 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${winner === 'team1' ? 'text-red-500' : 'text-neutral-400'}`}>
                    {t1.join(' & ')}
                  </span>
                  <span className="text-lg font-bold text-white">{result.team1Vegas}</span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-sm font-semibold ${winner === 'team2' ? 'text-orange-400' : 'text-neutral-400'}`}>
                    {t2.join(' & ')}
                  </span>
                  <span className="text-lg font-bold text-white">{result.team2Vegas}</span>
                </div>
                <div className="text-center mt-2 pt-2 border-t border-neutral-800">
                  {winner === 'tie' ? (
                    <span className="text-neutral-400 text-sm">Push</span>
                  ) : (
                    <span className={`font-bold ${winner === 'team1' ? 'text-red-500' : 'text-orange-400'}`}>
                      {winner === 'team1' ? t1.join(' & ') : t2.join(' & ')} win {Math.abs(multipliedPoints)} pts
                      {currentMult !== 'none' && (
                        <span className="text-yellow-400 ml-1 text-xs uppercase">({currentMult} x{multValue})</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Press / Roll / Re-Roll buttons */}
                <div className="flex gap-2 mt-3 pt-3 border-t border-neutral-800">
                  {currentMult !== 'none' && (
                    <button
                      onClick={() => onSetMultiplier(match.id, currentHole, 'none')}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold bg-neutral-800 text-neutral-400"
                    >
                      Clear
                    </button>
                  )}
                  {nextStep && (
                    <button
                      onClick={() => onSetMultiplier(match.id, currentHole, nextStep.value)}
                      className="flex-1 py-2 rounded-lg text-xs font-bold bg-yellow-600 text-white"
                    >
                      {nextStep.label}
                    </button>
                  )}
                  {currentMult === 're-roll' && (
                    <span className="flex-1 py-2 rounded-lg text-xs font-bold bg-red-900 text-red-300 text-center">
                      Max (x8)
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Running totals for active matches */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide">Running Totals (Rotation {rotation})</h2>
        {activeMatches.map((match) => {
          let total = 0;
          const startHole = (match.rotation - 1) * 6 + 1;
          for (let h = startHole; h <= currentHole; h++) {
            const r = getMatchResultsForHole(match, h);
            if (r) total += r.points * getMultiplierValue(getMultiplier(match.id, h));
          }
          const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '?');
          const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '?');

          const leadingTeam = total > 0 ? t1.join(' & ') : t2.join(' & ');
          const trailingTeam = total > 0 ? t2.join(' & ') : t1.join(' & ');
          const leadColor = total > 0 ? 'text-red-400' : 'text-orange-300';
          const trailColor = total > 0 ? 'text-orange-300' : 'text-red-400';

          return (
            <div key={match.id} className="bg-neutral-900 rounded-lg p-3 flex items-center justify-between">
              <div className="text-sm">
                <span className={leadColor}>{leadingTeam}</span>
                <span className="text-neutral-500 mx-1">vs</span>
                <span className={trailColor}>{trailingTeam}</span>
              </div>
              <span className={`font-bold text-lg ${total === 0 ? 'text-neutral-400' : leadColor}`}>
                {total === 0 ? 'Even' : `+${Math.abs(total)}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Next hole button */}
      {allScoresEntered && currentHole < 18 && (
        <button
          onClick={() => onSetCurrentHole(currentHole + 1)}
          className="w-full mt-6 bg-red-600 text-white py-3 rounded-xl font-semibold text-lg"
        >
          Next Hole &gt;
        </button>
      )}
    </div>
  );
}
