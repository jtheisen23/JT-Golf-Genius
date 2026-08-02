import { Player, Match, Multiplier, HoleSetup, MatchResult } from '../types';
import ShareMenu from './ShareMenu';
import { computePerformances, findMVP, formatDifferential } from '../utils/performance';
import { computePartnerReport, formatToPar } from '../utils/partners';

interface Props {
  players: Player[];
  matches: Match[];
  holes: HoleSetup[];
  scores: Record<string, Record<number, number>>;
  courseName: string;
  pointValue: number;
  getMatchTotal: (match: Match) => number;
  getPlayerMoney: (playerId: string) => number;
  onBack: () => void;
  onFinish: () => void;
  getMatchResultsForHole: (match: Match, holeNumber: number) => { team1Vegas: number; team2Vegas: number; points: number } | null;
  getMultiplier: (matchId: string, holeNumber: number) => Multiplier;
  getMultiplierValue: (m: Multiplier) => number;
}

export default function Scoreboard({
  players,
  matches,
  holes,
  scores,
  courseName,
  pointValue,
  getMatchTotal,
  getPlayerMoney,
  onBack,
  onFinish,
  getMatchResultsForHole,
  getMultiplier,
  getMultiplierValue,
}: Props) {
  // --- Post-round summary calculations ---

  // Money rankings
  const moneyRankings = players
    .map((p) => ({ player: p, money: getPlayerMoney(p.id) }))
    .sort((a, b) => b.money - a.money);

  // Performance analysis (holes won/tied + grades + MVP)
  const performances = computePerformances(players, holes, scores);
  const mvp = findMVP(performances);
  const perfById = new Map(performances.map((p) => [p.playerId, p]));
  const holesWonRankings = players
    .map((p) => {
      const perf = perfById.get(p.id)!;
      return { player: p, won: perf.holesWon, tied: perf.holesTied };
    })
    .sort((a, b) => b.won - a.won || b.tied - a.tied);
  const gradeRankings = players
    .map((p) => ({ player: p, perf: perfById.get(p.id)! }))
    .sort((a, b) => b.perf.differential - a.perf.differential);

  const gradeBg: Record<string, string> = {
    A: 'bg-yellow-500 text-black',
    B: 'bg-green-600 text-white',
    C: 'bg-blue-600 text-white',
    D: 'bg-orange-600 text-white',
    F: 'bg-red-700 text-white',
  };

  // Partnerships: combine each unique pair's points across all matches
  const partnershipMap = new Map<string, { ids: [string, string]; points: number }>();
  matches.forEach((match) => {
    const total = getMatchTotal(match);
    const pairs: { pair: [string, string]; points: number }[] = [
      { pair: match.team1, points: total },
      { pair: match.team2, points: -total },
    ];
    pairs.forEach(({ pair, points }) => {
      const key = [...pair].sort().join('|');
      const existing = partnershipMap.get(key);
      if (existing) {
        existing.points += points;
      } else {
        partnershipMap.set(key, { ids: pair, points });
      }
    });
  });
  const partnershipRankings = Array.from(partnershipMap.values()).sort((a, b) => b.points - a.points);

  const playerName = (id: string) => players.find((p) => p.id === id)?.name || '?';

  // Partner report: net-scoring breakdown of each player alongside each partner.
  // Sorted so the best partners (most carried, lowest net) surface first.
  const partnerReport = computePartnerReport(players, matches, holes, scores, getMatchTotal).sort(
    (a, b) => b.carried - a.carried || a.leaned - b.leaned || a.overallToPar - b.overallToPar,
  );

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} className="text-red-500 text-sm font-medium">
          &lt; Back
        </button>
        <h1 className="text-xl font-bold text-red-500">Scoreboard</h1>
        <div className="w-12" />
      </div>

      {/* Post-Round Summary */}
      <div className="bg-gradient-to-br from-red-950 to-neutral-900 border border-red-900 rounded-xl p-4 mb-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">🏆</span>
          <h2 className="text-sm font-bold text-yellow-400 uppercase tracking-wide">
            Round Summary
          </h2>
        </div>

        {/* Round MVP */}
        {mvp && mvp.holesPlayed > 0 && (
          <div className="mb-4 bg-gradient-to-r from-yellow-600/30 to-yellow-900/30 border border-yellow-600 rounded-xl p-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">👑</span>
              <div className="flex-1">
                <div className="text-[10px] text-yellow-400 font-semibold uppercase tracking-widest">
                  Round MVP
                </div>
                <div className="text-white text-lg font-bold">{mvp.name}</div>
                <div className="text-[11px] text-neutral-300">
                  {mvp.holesWon} won · {mvp.holesTied} tied
                  {(mvp.birdies > 0 || mvp.eagles > 0) && (
                    <>
                      {' · '}
                      <span className="text-red-400">
                        {mvp.birdies} birdie{mvp.birdies === 1 ? '' : 's'}
                        {mvp.eagles > 0 && `, ${mvp.eagles} eagle${mvp.eagles === 1 ? '' : 's'}`}
                      </span>
                    </>
                  )}
                  {' · '}
                  <span className={mvp.differential >= 0 ? 'text-green-400' : 'text-orange-400'}>
                    {formatDifferential(mvp.differential)} vs handicap
                  </span>
                </div>
              </div>
              <span
                className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-xl ${
                  gradeBg[mvp.grade]
                }`}
              >
                {mvp.grade}
              </span>
            </div>
          </div>
        )}

        {/* Money Ranking */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            Money Leaderboard
          </h3>
          <div className="space-y-1.5">
            {moneyRankings.map(({ player, money }, idx) => (
              <div key={player.id} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold w-5 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-orange-400' : 'text-neutral-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-white text-sm font-medium">{player.name}</span>
                </div>
                <span
                  className={`font-bold ${
                    money > 0 ? 'text-red-400' : money < 0 ? 'text-orange-400' : 'text-neutral-400'
                  }`}
                >
                  {money >= 0 ? '+' : ''}${money.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Holes Won Ranking */}
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            Holes Won (Low Gross)
          </h3>
          <div className="space-y-1.5">
            {holesWonRankings.map(({ player, won, tied }, idx) => (
              <div key={player.id} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-bold w-5 text-center ${
                    idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-orange-400' : 'text-neutral-500'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="text-white text-sm font-medium">{player.name}</span>
                </div>
                <div className="flex items-center gap-3 text-sm font-bold">
                  <span className="text-red-400">
                    {won} <span className="text-[10px] text-neutral-400 font-normal">won</span>
                  </span>
                  <span className="text-yellow-400">
                    {tied} <span className="text-[10px] text-neutral-400 font-normal">tied</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">Only sole low gross counts as a win; ties are tracked separately.</p>
        </div>

        {/* Partnership Rankings */}
        {partnershipRankings.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
              Best Partnerships
            </h3>
            <div className="space-y-1.5">
              {partnershipRankings.map(({ ids, points }, idx) => (
                <div key={ids.join('-')} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold w-5 text-center ${
                      idx === 0 ? 'text-yellow-400' : idx === 1 ? 'text-neutral-300' : idx === 2 ? 'text-orange-400' : 'text-neutral-500'
                    }`}>
                      {idx + 1}
                    </span>
                    <span className="text-white text-sm font-medium">
                      {playerName(ids[0])} <span className="text-neutral-500">&</span> {playerName(ids[1])}
                    </span>
                  </div>
                  <span
                    className={`font-bold ${
                      points > 0 ? 'text-red-400' : points < 0 ? 'text-orange-400' : 'text-neutral-400'
                    }`}
                  >
                    {points > 0 ? '+' : ''}{points} pts
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Partner Report — who carried, who leaned (by net scoring) */}
        {partnerReport.length > 0 && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-1">
              Partner Report
            </h3>
            <p className="text-[11px] text-neutral-500 mb-2">
              Net score vs. par next to each partner. <span className="text-emerald-400">Carried</span> = you
              out-scored your partner; <span className="text-orange-400">Leaned</span> = they carried you.
            </p>
            <div className="space-y-2">
              {partnerReport.map((row) => (
                <div key={row.playerId} className="bg-neutral-800/60 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-white text-sm font-semibold">{playerName(row.playerId)}</span>
                    <span className="text-[11px]">
                      <span className="text-emerald-400">Carried {row.carried}</span>
                      <span className="text-neutral-600"> · </span>
                      <span className="text-orange-400">Leaned {row.leaned}</span>
                      <span className="text-neutral-500"> · net {formatToPar(row.overallToPar)}</span>
                    </span>
                  </div>
                  <div className="space-y-1">
                    {row.pairings
                      .slice()
                      .sort((a, b) => a.rotation - b.rotation)
                      .map((pr) => (
                        <div
                          key={pr.partnerId + pr.rotation}
                          className="flex items-center justify-between text-xs"
                        >
                          <span className="text-neutral-300">
                            with {playerName(pr.partnerId)}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-neutral-400">
                              {formatToPar(pr.playerToPar)}
                              <span className="text-neutral-600"> vs </span>
                              {formatToPar(pr.partnerToPar)}
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                                pr.outcome === 'carried'
                                  ? 'bg-emerald-900/60 text-emerald-300'
                                  : pr.outcome === 'leaned'
                                    ? 'bg-orange-900/60 text-orange-300'
                                    : 'bg-neutral-700 text-neutral-300'
                              }`}
                            >
                              {pr.outcome === 'carried' ? 'Carried' : pr.outcome === 'leaned' ? 'Leaned' : 'Even'}
                            </span>
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Performance Grades */}
        <div>
          <h3 className="text-xs font-semibold text-neutral-400 uppercase tracking-wide mb-2">
            Performance Grades
          </h3>
          <div className="space-y-1.5">
            {gradeRankings.map(({ player, perf }) => (
              <div key={player.id} className="flex items-center justify-between bg-neutral-800/60 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-black text-sm ${
                      gradeBg[perf.grade]
                    }`}
                  >
                    {perf.grade}
                  </span>
                  <span className="text-white text-sm font-medium">{player.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-neutral-400">
                    Hcp {player.handicap} · Shot{' '}
                    {perf.holesPlayed > 0
                      ? perf.scoreToPar === 0
                        ? 'E'
                        : perf.scoreToPar > 0
                        ? `+${perf.scoreToPar}`
                        : perf.scoreToPar
                      : '-'}
                    {(perf.birdies > 0 || perf.eagles > 0) && (
                      <span className="text-red-400 ml-1">
                        · {perf.eagles > 0 && `${perf.eagles}E `}
                        {perf.birdies > 0 && `${perf.birdies}B`}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-sm font-bold ${
                      perf.differential >= 0 ? 'text-green-400' : 'text-orange-400'
                    }`}
                  >
                    {formatDifferential(perf.differential)} vs hcp
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-neutral-500 mt-1">
            Grade combines score vs handicap with holes won/tied and natural birdies/eagles. A ≥ +4, B ≥ +2, C ±1, D -2 to -4, F ≤ -5.
          </p>
        </div>
      </div>

      {/* Match Details */}
      {[1, 2, 3].map((rotation) => {
        const rotationMatches = matches.filter((m) => m.rotation === rotation);
        if (rotationMatches.length === 0) return null;

        return (
          <div key={rotation} className="mb-6">
            <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wide mb-3">
              Rotation {rotation} (Holes {(rotation - 1) * 6 + 1}-{rotation * 6})
            </h2>

            {rotationMatches.map((match) => {
              const total = getMatchTotal(match);
              const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '?');
              const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '?');
              const startHole = (match.rotation - 1) * 6 + 1;
              const endHole = match.rotation * 6;

              return (
                <div key={match.id} className="bg-neutral-900 rounded-xl p-4 mb-3">
                  {(() => {
                    const leadTeam = total > 0 ? t1.join(' & ') : t2.join(' & ');
                    const trailTeam = total > 0 ? t2.join(' & ') : t1.join(' & ');
                    const leadColor = total > 0 ? 'text-red-400' : 'text-orange-300';
                    const trailColor = total > 0 ? 'text-orange-300' : 'text-red-400';
                    return (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div>
                            <span className={`text-sm font-semibold ${leadColor}`}>{leadTeam}</span>
                            <span className="text-neutral-500 text-sm mx-2">vs</span>
                            <span className={`text-sm font-semibold ${trailColor}`}>{trailTeam}</span>
                          </div>
                          <span className={`font-bold text-lg ${total === 0 ? 'text-neutral-400' : leadColor}`}>
                            {total === 0 ? '0' : `+${Math.abs(total)}`} pts
                          </span>
                        </div>
                        <div className="text-right text-sm">
                          <span className={`font-semibold ${total === 0 ? 'text-neutral-400' : leadColor}`}>
                            ${Math.abs(total * pointValue).toFixed(2)}
                            {total !== 0 && (
                              <span className="text-neutral-500 ml-1">
                                to {leadTeam}
                              </span>
                            )}
                          </span>
                        </div>
                      </>
                    );
                  })()}

                  {/* Hole-by-hole breakdown */}
                  <div className="mt-3 pt-3 border-t border-neutral-800">
                    <div className="grid grid-cols-7 gap-1 text-xs text-center">
                      <div className="text-neutral-500">Hole</div>
                      {Array.from({ length: 6 }, (_, i) => startHole + i).map((h) => (
                        <div key={h} className="text-neutral-500">{h}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7 gap-1 text-xs text-center mt-1">
                      <div className="text-neutral-500">Pts</div>
                      {Array.from({ length: 6 }, (_, i) => startHole + i).map((h) => {
                        const result = getMatchResultsForHole(match, h);
                        if (!result) return <div key={h} className="text-neutral-600">-</div>;
                        const mult = getMultiplier(match.id, h);
                        const multVal = getMultiplierValue(mult);
                        const rawPts = result.points * multVal;
                        // Color matches team: positive (team1 won) = red, negative (team2 won) = orange
                        const holeColor = rawPts > 0 ? 'text-red-400' : rawPts < 0 ? 'text-orange-300' : 'text-neutral-500';
                        const multLabel = mult === 'press' ? 'P' : mult === 'roll' ? 'R' : mult === 're-roll' ? 'RR' : '';
                        return (
                          <div key={h} className={`font-semibold ${holeColor}`}>
                            {rawPts === 0 ? '0' : `+${Math.abs(rawPts)}`}
                            {multLabel && <div className="text-yellow-400 text-[9px]">{multLabel}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Share Menu */}
      <div className="mb-4">
        <ShareMenu
          data={{
            courseName,
            date: new Date().toISOString(),
            players,
            holes,
            matches,
            scores,
            pointValue,
            results: matches.map<MatchResult>((match) => {
              const total = getMatchTotal(match);
              const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '').join(' & ');
              const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '').join(' & ');
              return {
                matchId: match.id,
                team1Names: t1,
                team2Names: t2,
                totalPoints: total,
                money: total * pointValue,
              };
            }),
          }}
        />
      </div>

      <button
        onClick={() => {
          const ok = window.confirm(
            'Are you sure you want to finish and save this round? You will return to the tournaments list and can start a new event.'
          );
          if (ok) onFinish();
        }}
        className="w-full mt-4 bg-red-600 text-white py-3 rounded-xl font-semibold text-lg"
      >
        Finish & Save Round
      </button>
    </div>
  );
}
