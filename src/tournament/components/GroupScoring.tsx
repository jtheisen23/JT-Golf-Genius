import { useMemo, useState } from 'react';
import type { Tournament } from '../types';
import { getStrokesOnHole } from '../../utils/handicap';
import { stablefordPoints, formatToPar } from '../scoring';
import { formatHandicap } from '../../components/PlayerIndexInput';
import { tournamentPartnerReport } from '../partnerReport';
import PartnerReport from '../../components/PartnerReport';

interface Props {
  tournament: Tournament;
  groupId: string;
  onSetScore: (groupId: string, playerId: string, hole: number, value: number | null) => void;
  onOpenLeaderboard: () => void;
  onBack: () => void;
}

export default function GroupScoring({
  tournament,
  groupId,
  onSetScore,
  onOpenLeaderboard,
  onBack,
}: Props) {
  const group = tournament.groups.find((g) => g.id === groupId);
  const [hole, setHole] = useState(1);

  const players = useMemo(
    () => (group ? group.playerIds.map((id) => tournament.players[id]).filter(Boolean) : []),
    [group, tournament.players],
  );

  if (!group) {
    return (
      <div className="p-6 text-center text-neutral-400">
        Group not found.
        <button onClick={onBack} className="block mx-auto mt-4 text-emerald-400 underline">
          Back
        </button>
      </div>
    );
  }

  const holeSetup = tournament.holes.find((h) => h.number === hole);
  if (!holeSetup) return null;

  const groupScores = tournament.scores[groupId] || {};
  const partnerRows = tournamentPartnerReport(tournament, groupId);
  const nameFor = (id: string) => tournament.players[id]?.name || '?';

  const totals = players.map((p) => {
    const s = groupScores[p.id] || {};
    let thru = 0;
    let gross = 0;
    let parPlayed = 0;
    tournament.holes.forEach((h) => {
      const v = s[h.number];
      if (v != null) {
        thru += 1;
        gross += v;
        parPlayed += h.par;
      }
    });
    return { thru, gross, toPar: gross - parPlayed };
  });

  return (
    <div className="min-h-screen bg-black text-neutral-100 pb-28">
      <header className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-neutral-800 p-3">
        <div className="flex items-center justify-between">
          <button onClick={onBack} className="text-sm text-neutral-400">
            ← Event
          </button>
          <div className="text-center">
            <div className="text-xs text-neutral-500">{tournament.name}</div>
            <div className="font-semibold">{group.name}</div>
          </div>
          <button
            onClick={onOpenLeaderboard}
            className="text-sm text-emerald-400"
          >
            Board →
          </button>
        </div>
      </header>

      <div className="p-3">
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => setHole((h) => Math.max(1, h - 1))}
            disabled={hole === 1}
            className="px-4 py-3 rounded-lg bg-neutral-900 disabled:opacity-30"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-xs text-neutral-500 uppercase tracking-widest">Hole</div>
            <div className="text-4xl font-black">{hole}</div>
            <div className="text-sm text-neutral-400">
              Par {holeSetup.par} · SI {holeSetup.handicapRating}
            </div>
          </div>
          <button
            onClick={() => setHole((h) => Math.min(tournament.holes.length, h + 1))}
            disabled={hole === tournament.holes.length}
            className="px-4 py-3 rounded-lg bg-neutral-900 disabled:opacity-30"
          >
            ›
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-2 mb-3">
          {tournament.holes.map((h) => {
            const hasAllScores = players.every((p) => groupScores[p.id]?.[h.number] != null);
            const isCurrent = h.number === hole;
            return (
              <button
                key={h.number}
                onClick={() => setHole(h.number)}
                className={`flex-shrink-0 w-9 h-9 text-xs rounded-md font-semibold ${
                  isCurrent
                    ? 'bg-emerald-600 text-white'
                    : hasAllScores
                    ? 'bg-neutral-800 text-emerald-400'
                    : 'bg-neutral-900 text-neutral-500'
                }`}
              >
                {h.number}
              </button>
            );
          })}
        </div>

        <div className="space-y-3">
          {players.map((p, idx) => {
            const gross = groupScores[p.id]?.[hole];
            const strokes = getStrokesOnHole(p.courseHandicap, holeSetup.handicapRating);
            const net = gross != null ? gross - strokes : null;
            const sf = net != null ? stablefordPoints(net, holeSetup.par) : null;
            const t = totals[idx];

            return (
              <div key={p.id} className="bg-neutral-900 rounded-xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-semibold">{p.name}</div>
                    <div className="text-xs text-neutral-500">
                      CH {formatHandicap(p.courseHandicap)} · Thru {t.thru}
                      {t.thru > 0 && ` · ${formatToPar(t.toPar)}`}
                    </div>
                  </div>
                  {strokes > 0 && (
                    <div className="text-[10px] bg-yellow-600 text-black px-1.5 py-0.5 rounded font-bold">
                      {strokes === 1 ? '•' : '••'}
                    </div>
                  )}
                </div>

                <div className="flex gap-1 flex-wrap">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                    const selected = gross === score;
                    const relative = score - holeSetup.par;
                    const tone =
                      relative <= -2
                        ? 'bg-yellow-400 text-black'
                        : relative === -1
                        ? 'bg-red-500 text-white'
                        : relative === 0
                        ? 'bg-emerald-600 text-white'
                        : relative === 1
                        ? 'bg-neutral-700 text-white'
                        : 'bg-neutral-800 text-neutral-400';
                    return (
                      <button
                        key={score}
                        onClick={() =>
                          onSetScore(groupId, p.id, hole, selected ? null : score)
                        }
                        className={`w-10 h-10 rounded-lg font-bold text-sm ${
                          selected ? tone + ' ring-2 ring-white' : 'bg-neutral-800 text-neutral-300'
                        }`}
                      >
                        {score}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => onSetScore(groupId, p.id, hole, null)}
                    className="px-3 h-10 rounded-lg text-xs bg-neutral-800 text-neutral-500"
                  >
                    Clear
                  </button>
                </div>

                {gross != null && (
                  <div className="mt-2 text-xs text-neutral-400 flex gap-3">
                    <span>Gross {gross}</span>
                    {strokes > 0 && <span className="text-emerald-400">Net {net}</span>}
                    {sf != null && <span>Stableford {sf}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {partnerRows.length > 0 && (
          <div className="mt-6">
            <PartnerReport rows={partnerRows} nameFor={nameFor} accent="emerald" />
          </div>
        )}
      </div>
    </div>
  );
}
