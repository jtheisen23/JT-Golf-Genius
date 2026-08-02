import { useState, useEffect, useMemo } from 'react';
import { SavedRound } from '../types';
import { loadRounds, deleteRound } from '../utils/storage';
import { computeSeasonPartners } from '../utils/partners';
import { tournamentGroupsAsRounds } from '../tournament/partnerReport';
import { makeVegasComputers } from '../utils/vegasCompute';
import SeasonStats from './SeasonStats';
import Scoreboard from './Scoreboard';
import ShareMenu from './ShareMenu';
import { sync } from '../tournament/sync';
import type { Tournament } from '../tournament/types';
import { saveVegasGame, type VegasGameState } from '../hooks/vegasSync';

interface Props {
  onBack: () => void;
  onEditRound: (round: SavedRound) => void;
}

interface Match {
  tournament: Tournament;
  groupId: string;
  groupName: string;
  vegasGameCode?: string;
}

/** Find tournament groups whose playerIds set equals the saved round's player IDs.
 *  Vegas games launched from a tournament reuse tournament player IDs (vegasSync
 *  createVegasGameFromTournament), so an exact set match is the right join. */
function findMatchingGroups(round: SavedRound, tournaments: Tournament[]): Match[] {
  const roundIds = new Set(round.players.map((p) => p.id));
  const matches: Match[] = [];
  for (const t of tournaments) {
    for (const g of t.groups) {
      const groupIds = new Set(g.playerIds);
      if (groupIds.size !== roundIds.size) continue;
      let same = true;
      for (const id of groupIds) if (!roundIds.has(id)) { same = false; break; }
      if (same) matches.push({ tournament: t, groupId: g.id, groupName: g.name, vegasGameCode: g.vegasGameCode });
    }
  }
  return matches;
}

export default function RoundHistory({ onBack, onEditRound }: Props) {
  const [rounds, setRounds] = useState<SavedRound[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [importStatus, setImportStatus] = useState<Record<string, string>>({});
  const [view, setView] = useState<'rounds' | 'season'>('rounds');
  const [viewingRound, setViewingRound] = useState<SavedRound | null>(null);

  // Season stats pull from saved Vegas rounds AND tournament groups (same
  // format). Skip any tournament group already saved as a Vegas round — a Vegas
  // game launched from a group reuses the group's player IDs — so it's counted
  // once. Both sources run through the same aggregator + alias consolidation.
  const seasonPlayers = useMemo(() => {
    const vegasIdSets = rounds.map((r) => new Set((r.players ?? []).map((p) => p.id)));
    const alreadySaved = (ids: string[]) => {
      const set = new Set(ids);
      return vegasIdSets.some((vs) => vs.size === set.size && [...set].every((id) => vs.has(id)));
    };
    const tourRounds = tournamentGroupsAsRounds(tournaments).filter(
      (tr) => !alreadySaved(tr.players.map((p) => p.id)),
    );
    return computeSeasonPartners([...rounds, ...tourRounds]);
  }, [rounds, tournaments]);

  useEffect(() => {
    setRounds(loadRounds());
    sync.fetchAll().then(setTournaments).catch(() => {});
  }, []);

  const handleDelete = (id: string) => {
    const ok = window.confirm('Delete this round? This cannot be undone.');
    if (!ok) return;
    deleteRound(id);
    setRounds(loadRounds());
  };

  const handleEdit = (round: SavedRound) => {
    const ok = window.confirm(
      'Edit this round? It will be re-opened as the active round so you can make changes. When you finish & save, a new entry will be created and this one will be removed.'
    );
    if (!ok) return;
    deleteRound(round.id);
    onEditRound(round);
  };

  const handleImport = (round: SavedRound) => {
    const matches = findMatchingGroups(round, tournaments);
    if (matches.length === 0) {
      setImportStatus((s) => ({ ...s, [round.id]: 'No tournament group matches these players.' }));
      return;
    }
    let target = matches[0];
    if (matches.length > 1) {
      const labels = matches.map((m, i) => `${i + 1}. ${m.tournament.name} — ${m.groupName}`).join('\n');
      const choice = window.prompt(`Multiple tournament groups match. Type the number to import into:\n\n${labels}`, '1');
      const idx = Number(choice) - 1;
      if (Number.isNaN(idx) || idx < 0 || idx >= matches.length) {
        setImportStatus((s) => ({ ...s, [round.id]: 'Import cancelled.' }));
        return;
      }
      target = matches[idx];
    }

    const ok = window.confirm(
      `Import ${round.players.length} players' scores into "${target.tournament.name} — ${target.groupName}"? Existing scores in that group will be overwritten.`
    );
    if (!ok) return;

    let written = 0;
    for (const player of round.players) {
      const playerScores = round.scores?.[player.id] || {};
      for (const [holeStr, score] of Object.entries(playerScores)) {
        const hole = Number(holeStr);
        if (!Number.isFinite(hole) || score == null) continue;
        sync.saveScore(target.tournament.id, target.groupId, player.id, hole, score as number);
        written += 1;
      }
    }

    // Also rebuild the Vegas Firebase doc from the saved round so the
    // leaderboard's Money column (which reads vegas/{code}, not tournament
    // scores) populates again. Only does anything if the group had a
    // vegasGameCode recorded — otherwise the Vegas side never existed.
    let vegasRestored = false;
    if (target.vegasGameCode) {
      const state: VegasGameState = {
        screen: 'scoreboard',
        players: round.players,
        holes: round.holes,
        matches: round.matches,
        scores: round.scores ?? {},
        currentHole: 18,
        courseName: round.courseName,
        pointValue: round.pointsPerDollar,
        multipliers: round.multipliers ?? {},
        handicapMode: 'off-the-low',
        slope: round.slope,
        courseRating: round.courseRating,
      };
      saveVegasGame(target.vegasGameCode, state);
      vegasRestored = true;
    }

    setImportStatus((s) => ({
      ...s,
      [round.id]: `✓ Imported ${written} scores into ${target.tournament.name} — ${target.groupName}.${vegasRestored ? ' Vegas game restored.' : ''}`,
    }));
  };

  if (viewingRound) {
    const c = makeVegasComputers({
      players: viewingRound.players,
      holes: viewingRound.holes,
      matches: viewingRound.matches,
      scores: viewingRound.scores ?? {},
      multipliers: viewingRound.multipliers,
      pointValue: viewingRound.pointsPerDollar,
    });
    return (
      <Scoreboard
        players={viewingRound.players}
        matches={viewingRound.matches}
        holes={viewingRound.holes}
        scores={viewingRound.scores ?? {}}
        courseName={viewingRound.courseName}
        pointValue={viewingRound.pointsPerDollar}
        getMatchTotal={c.getMatchTotal}
        getPlayerMoney={c.getPlayerMoney}
        getMatchResultsForHole={c.getMatchResultsForHole}
        getMultiplier={c.getMultiplier}
        getMultiplierValue={c.getMultiplierValue}
        onBack={() => setViewingRound(null)}
        onFinish={() => setViewingRound(null)}
        readOnly
      />
    );
  }

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-red-500 text-sm font-medium">
          &lt; Back
        </button>
        <h1 className="text-xl font-bold text-red-500">
          {view === 'season' ? 'Partner Stats' : 'Round History'}
        </h1>
        <div className="w-12" />
      </div>

      <div className="flex gap-1 mb-5 bg-neutral-900 rounded-lg p-1">
        {(['rounds', 'season'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
              view === v ? 'bg-red-600 text-white' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {v === 'rounds' ? 'Rounds' : 'Partner Stats'}
          </button>
        ))}
      </div>

      {view === 'season' ? (
        <SeasonStats players={seasonPlayers} roundCount={rounds.length} />
      ) : rounds.length === 0 ? (
        <div className="text-center text-neutral-500 mt-12">
          <p className="text-lg">No saved rounds yet</p>
          <p className="text-sm mt-2">Finish a round to see it here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rounds.map((round) => {
            const matchCount = findMatchingGroups(round, tournaments).length;
            return (
            <div key={round.id} className="bg-neutral-900 rounded-xl overflow-hidden">
              <button
                onClick={() => setExpandedId(expandedId === round.id ? null : round.id)}
                className="w-full p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-white font-medium">
                      {round.courseName || 'Unnamed Course'}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {new Date(round.date).toLocaleDateString()} | {round.players.length} players
                    </div>
                  </div>
                  <span className="text-neutral-400 text-lg">{expandedId === round.id ? '-' : '+'}</span>
                </div>
              </button>

              {expandedId === round.id && (
                <div className="px-4 pb-4 border-t border-neutral-800 pt-3">
                  <div className="text-xs text-neutral-500 mb-2">
                    Players: {(round.players ?? []).map((p) => p.name).join(', ')}
                  </div>

                  {(round.results ?? []).length === 0 && (
                    <div className="text-xs text-neutral-500 italic mb-2">
                      No match results recorded for this round.
                    </div>
                  )}

                  {(round.results ?? []).map((result) => (
                    <div key={result.matchId} className="bg-neutral-800 rounded-lg p-3 mb-2">
                      <div className="flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-red-400">{result.team1Names}</span>
                          <span className="text-neutral-500 mx-1">vs</span>
                          <span className="text-orange-300">{result.team2Names}</span>
                        </div>
                        <span
                          className={`font-bold text-sm ${
                            result.totalPoints > 0
                              ? 'text-red-500'
                              : result.totalPoints < 0
                              ? 'text-orange-400'
                              : 'text-neutral-400'
                          }`}
                        >
                          {result.totalPoints > 0 ? '+' : ''}
                          {result.totalPoints} (${Math.abs(result.money).toFixed(2)})
                        </span>
                      </div>
                    </div>
                  ))}

                  <div className="mt-3">
                    <ShareMenu
                      data={{
                        courseName: round.courseName,
                        date: round.date,
                        players: round.players,
                        holes: round.holes,
                        matches: round.matches,
                        scores: round.scores,
                        results: round.results,
                        pointValue: round.pointsPerDollar,
                      }}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => setViewingRound(round)}
                      className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      📊 View Summary
                    </button>
                    <button
                      onClick={() => handleEdit(round)}
                      className="bg-neutral-800 border border-neutral-700 text-neutral-200 px-3 py-1.5 rounded-lg text-xs font-semibold"
                    >
                      ✏️ Edit Round
                    </button>
                    {matchCount > 0 && (
                      <button
                        onClick={() => handleImport(round)}
                        className="bg-emerald-700 text-emerald-50 px-3 py-1.5 rounded-lg text-xs font-semibold"
                      >
                        📥 Import to Tournament
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(round.id)}
                      className="text-red-400 text-xs ml-auto"
                    >
                      Delete Round
                    </button>
                  </div>

                  {importStatus[round.id] && (
                    <div className="mt-2 text-xs text-emerald-400">{importStatus[round.id]}</div>
                  )}
                </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
