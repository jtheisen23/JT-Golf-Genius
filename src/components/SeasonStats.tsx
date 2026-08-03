import { SeasonPlayer, formatToPar } from '../utils/partners';

interface Props {
  players: SeasonPlayer[];
  roundCount: number;
}

/**
 * Season-long partner stats aggregated across every saved Vegas round,
 * matched by player name. Shows who is the best partner overall and who
 * tends to lean on their partners.
 */
export default function SeasonStats({ players, roundCount }: Props) {
  if (players.length === 0) {
    return (
      <div className="text-center text-neutral-500 mt-10">
        <p className="text-sm">No partner data yet.</p>
        <p className="text-xs mt-1">Finish some Vegas rounds and they'll roll up here.</p>
      </div>
    );
  }

  // Rank by rate, not raw counts, so a guy who plays more doesn't win by volume.
  // Carried/leaned % is out of decided pairings (excludes ties).
  const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const withRates = players.map((p) => {
    const decided = p.carried + p.leaned;
    return {
      p,
      decided,
      carriedPct: pct(p.carried, decided),
      leanedPct: pct(p.leaned, decided),
    };
  });
  // Highest carried% (tiebreak: more decided pairings, then better net).
  const ranked = withRates
    .slice()
    .sort(
      (a, b) =>
        b.carriedPct - a.carriedPct || b.decided - a.decided || a.p.netToPar - b.p.netToPar,
    );
  // Best/worst headlines need a real track record — require a minimum number of
  // decided pairings, falling back to everyone if nobody clears the bar yet.
  const MIN_DECIDED = 10;
  const qualified = withRates.filter((r) => r.decided >= MIN_DECIDED);
  const pool = qualified.length > 0 ? qualified : withRates;
  const best = pool
    .slice()
    .sort((a, b) => b.carriedPct - a.carriedPct || b.decided - a.decided || a.p.netToPar - b.p.netToPar)[0];
  const liability = pool
    .slice()
    .sort((a, b) => b.leanedPct - a.leanedPct || b.decided - a.decided)[0];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-neutral-500">
        Across {roundCount} round{roundCount === 1 ? '' : 's'}. Players matched by name.
        <span className="text-emerald-400"> Carried</span> = won more holes than their partner;
        <span className="text-orange-400"> Leaned</span> = partner won more. Ranked by rate;
        Best/Worst need {qualified.length > 0 ? `${MIN_DECIDED}+` : 'at least a few'} decided pairings.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-400">Best partner</div>
          <div className="text-white font-semibold">{best.p.name}</div>
          <div className="text-[11px] text-neutral-400">
            Carried {best.carriedPct}% ({best.p.carried}/{best.decided})
          </div>
        </div>
        <div className="bg-orange-950/40 border border-orange-800/50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-orange-400">Leans the most</div>
          <div className="text-white font-semibold">{liability.p.name}</div>
          <div className="text-[11px] text-neutral-400">
            Leaned {liability.leanedPct}% ({liability.p.leaned}/{liability.decided})
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {ranked.map(({ p, carriedPct }) => {
          const perRound = p.rounds > 0 ? Math.round(p.netToPar / p.rounds) : 0;
          return (
            <div key={p.name} className="bg-neutral-900 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white text-sm font-semibold">{p.name}</span>
                <span className="text-[11px] text-neutral-400">
                  {p.rounds} rd · <span className="text-emerald-400">{carriedPct}% carried</span>
                  <span className="text-neutral-600"> ({p.carried}-{p.leaned})</span> ·{' '}
                  {formatToPar(perRound)}/rd
                </span>
              </div>
              <div className="space-y-1">
                {p.partners.map((link) => {
                  const diff = link.myToPar - link.theirToPar;
                  return (
                    <div key={link.partner} className="flex items-center justify-between text-xs">
                      <span className="text-neutral-300">
                        with {link.partner}
                        <span className="text-neutral-600"> ×{link.timesPaired}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span
                          className={
                            diff < 0 ? 'text-emerald-400' : diff > 0 ? 'text-orange-400' : 'text-neutral-400'
                          }
                        >
                          {formatToPar(diff)} net
                        </span>
                        <span className="text-neutral-500">
                          {link.carried}-{link.leaned}
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
