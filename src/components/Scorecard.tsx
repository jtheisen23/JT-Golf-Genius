import { useState } from 'react';
import { Player, HoleSetup } from '../types';
import { getNetScore } from '../utils/scoring';

interface Props {
  players: Player[];
  holes: HoleSetup[];
  scores: Record<string, Record<number, number>>;
  courseName: string;
  onBack: () => void;
}

type ScoreView = 'gross' | 'net';

export default function Scorecard({ players, holes, scores, courseName, onBack }: Props) {
  const [view, setView] = useState<ScoreView>('gross');

  const frontNine = holes.filter((h) => h.number <= 9);
  const backNine = holes.filter((h) => h.number > 9);

  const getPlayerGrossForHole = (playerId: string, holeNumber: number): number | undefined => {
    return scores[playerId]?.[holeNumber];
  };

  const getPlayerScoreForHole = (playerId: string, holeNumber: number): number | undefined => {
    const gross = scores[playerId]?.[holeNumber];
    if (gross == null) return undefined;
    if (view === 'gross') return gross;
    const hole = holes.find((h) => h.number === holeNumber);
    if (!hole) return gross;
    const player = players.find((p) => p.id === playerId);
    if (!player) return gross;
    return getNetScore(gross, player.strokesReceived, hole.handicapRating);
  };

  // Decorations are based on NATURAL (gross) score vs par.
  // Birdie = circle, Eagle = double circle, Bogey = square, Double bogey+ = double square.
  const renderScoreCell = (
    displayScore: number | undefined,
    gross: number | undefined,
    par: number
  ) => {
    if (displayScore == null) {
      return <span className="text-neutral-600">-</span>;
    }
    if (gross == null) {
      return <span className="text-white">{displayScore}</span>;
    }
    const diff = gross - par;

    const inner = 'inline-flex items-center justify-center w-6 h-6 text-xs leading-none';

    if (diff <= -2) {
      // Eagle: double circle (red) around white number
      return (
        <span className="inline-flex items-center justify-center rounded-full border border-red-500 p-[2px]">
          <span className={`${inner} rounded-full border border-red-500 text-white font-bold`}>
            {displayScore}
          </span>
        </span>
      );
    }
    if (diff === -1) {
      // Birdie: circle (red) around white number
      return (
        <span className={`${inner} rounded-full border border-red-500 text-white font-bold`}>
          {displayScore}
        </span>
      );
    }
    if (diff === 1) {
      // Bogey: square (orange) around white number
      return (
        <span className={`${inner} border border-orange-400 text-white`}>
          {displayScore}
        </span>
      );
    }
    if (diff >= 2) {
      // Double bogey+: double square (orange) around white number
      return (
        <span className="inline-flex items-center justify-center border border-orange-400 p-[2px]">
          <span className={`${inner} border border-orange-400 text-white`}>
            {displayScore}
          </span>
        </span>
      );
    }
    // Par
    return <span className={`${inner} text-white`}>{displayScore}</span>;
  };

  const sumForHoles = (playerId: string, holeList: HoleSetup[]): number => {
    let total = 0;
    for (const h of holeList) {
      const s = getPlayerScoreForHole(playerId, h.number);
      if (s != null) total += s;
    }
    return total;
  };

  const parSum = (holeList: HoleSetup[]) => holeList.reduce((sum, h) => sum + h.par, 0);

  const renderNine = (label: string, holeList: HoleSetup[], sumLabel: string) => (
    <div className="bg-neutral-900 rounded-xl p-3 mb-4 overflow-x-auto">
      <h3 className="text-red-500 font-semibold mb-2 text-sm uppercase tracking-wide">{label}</h3>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="text-neutral-400">
            <th className="text-left sticky left-0 bg-neutral-900 pr-2 py-1 font-semibold">Hole</th>
            {holeList.map((h) => (
              <th key={h.number} className="px-1 py-1 font-semibold text-center min-w-[32px]">
                {h.number}
              </th>
            ))}
            <th className="px-2 py-1 font-bold text-center text-yellow-400">{sumLabel}</th>
          </tr>
          <tr className="text-neutral-500 border-b border-neutral-800">
            <th className="text-left sticky left-0 bg-neutral-900 pr-2 py-1 font-normal">Par</th>
            {holeList.map((h) => (
              <th key={h.number} className="px-1 py-1 font-normal text-center">
                {h.par}
              </th>
            ))}
            <th className="px-2 py-1 font-semibold text-center text-neutral-300">{parSum(holeList)}</th>
          </tr>
          <tr className="text-neutral-500 border-b border-neutral-800">
            <th className="text-left sticky left-0 bg-neutral-900 pr-2 py-1 font-normal">HCP</th>
            {holeList.map((h) => (
              <th key={h.number} className="px-1 py-1 font-normal text-center">
                {h.handicapRating}
              </th>
            ))}
            <th className="px-2 py-1"></th>
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const total = sumForHoles(player.id, holeList);
            return (
              <tr key={player.id} className="border-b border-neutral-800 last:border-0">
                <td className="text-left sticky left-0 bg-neutral-900 pr-2 py-1.5 text-white font-medium whitespace-nowrap">
                  {player.name || '—'}
                </td>
                {holeList.map((h) => {
                  const score = getPlayerScoreForHole(player.id, h.number);
                  const gross = getPlayerGrossForHole(player.id, h.number);
                  return (
                    <td key={h.number} className="px-1 py-1 text-center">
                      {renderScoreCell(score, gross, h.par)}
                    </td>
                  );
                })}
                <td className="px-2 py-1.5 text-center text-yellow-400 font-bold">
                  {total || '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-red-500 text-sm font-medium">
          &lt; Back
        </button>
        <h1 className="text-xl font-bold text-red-500">Scorecard</h1>
        <div className="w-12" />
      </div>

      {courseName && (
        <div className="text-center text-neutral-400 text-sm mb-4">{courseName}</div>
      )}

      {/* Gross / Net toggle */}
      <div className="flex gap-1 mb-4 bg-neutral-900 rounded-lg p-1">
        <button
          onClick={() => setView('gross')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            view === 'gross'
              ? 'bg-red-600 text-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Gross
        </button>
        <button
          onClick={() => setView('net')}
          className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
            view === 'net'
              ? 'bg-red-600 text-white'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          Net
        </button>
      </div>

      {renderNine('Front 9', frontNine, 'OUT')}
      {renderNine('Back 9', backNine, 'IN')}

      {/* Totals */}
      <div className="bg-neutral-900 rounded-xl p-3">
        <h3 className="text-red-500 font-semibold mb-2 text-sm uppercase tracking-wide">Total</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-neutral-400 border-b border-neutral-800">
              <th className="text-left py-2 font-semibold">Player</th>
              <th className="text-center py-2 font-semibold">OUT</th>
              <th className="text-center py-2 font-semibold">IN</th>
              <th className="text-center py-2 font-semibold text-yellow-400">TOTAL</th>
              <th className="text-center py-2 font-semibold text-neutral-400">+/-</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const out = sumForHoles(player.id, frontNine);
              const inSum = sumForHoles(player.id, backNine);
              const total = out + inSum;
              const holesPlayed = holes.filter((h) => scores[player.id]?.[h.number] != null);
              const parPlayed = holesPlayed.reduce((sum, h) => sum + h.par, 0);
              const toPar = view === 'gross' ? total - parPlayed : total - parPlayed;
              return (
                <tr key={player.id} className="border-b border-neutral-800 last:border-0">
                  <td className="py-2 text-white font-medium">{player.name || '—'}</td>
                  <td className="text-center py-2 text-neutral-300">{out || '-'}</td>
                  <td className="text-center py-2 text-neutral-300">{inSum || '-'}</td>
                  <td className="text-center py-2 text-yellow-400 font-bold">{total || '-'}</td>
                  <td
                    className={`text-center py-2 font-semibold ${
                      toPar < 0 ? 'text-red-500' : toPar > 0 ? 'text-orange-400' : 'text-neutral-300'
                    }`}
                  >
                    {holesPlayed.length === 0 ? '-' : toPar === 0 ? 'E' : toPar > 0 ? `+${toPar}` : toPar}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
