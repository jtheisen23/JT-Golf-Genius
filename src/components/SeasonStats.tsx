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

  const best = players[0];
  const liability = players.slice().sort((a, b) => b.leaned - a.leaned)[0];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-neutral-500">
        Across {roundCount} saved round{roundCount === 1 ? '' : 's'}. Players matched by name.
        <span className="text-emerald-400"> Carried</span> = out-scored their partner (net);
        <span className="text-orange-400"> Leaned</span> = partner carried them.
      </p>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-emerald-950/40 border border-emerald-800/50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-400">Best partner</div>
          <div className="text-white font-semibold">{best.name}</div>
          <div className="text-[11px] text-neutral-400">
            Carried {best.carried} · Leaned {best.leaned}
          </div>
        </div>
        <div className="bg-orange-950/40 border border-orange-800/50 rounded-lg p-3">
          <div className="text-[10px] uppercase tracking-wide text-orange-400">Leans the most</div>
          <div className="text-white font-semibold">{liability.name}</div>
          <div className="text-[11px] text-neutral-400">
            Leaned {liability.leaned} · Carried {liability.carried}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {players.map((p) => {
          const perRound = p.rounds > 0 ? Math.round(p.netToPar / p.rounds) : 0;
          return (
            <div key={p.name} className="bg-neutral-900 rounded-lg px-3 py-2.5">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white text-sm font-semibold">{p.name}</span>
                <span className="text-[11px] text-neutral-400">
                  {p.rounds} rd · <span className="text-emerald-400">C {p.carried}</span>{' '}
                  <span className="text-orange-400">L {p.leaned}</span> ·{' '}
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
