import { PartnerReportRow, formatToPar } from '../utils/partners';

interface Props {
  rows: PartnerReportRow[];
  nameFor: (id: string) => string;
  /** Accent theme: red for Vegas, emerald for tournament. */
  accent?: 'red' | 'emerald';
}

/**
 * Per-player partner breakdown: for each pairing, each player's net score to
 * par over the holes they shared, tagged Carried / Leaned / Even.
 */
export default function PartnerReport({ rows, nameFor, accent = 'red' }: Props) {
  if (rows.length === 0) return null;
  const headColor = accent === 'emerald' ? 'text-emerald-400' : 'text-neutral-400';

  return (
    <div>
      <h3 className={`text-xs font-semibold ${headColor} uppercase tracking-wide mb-1`}>
        Partner Report
      </h3>
      <p className="text-[11px] text-neutral-500 mb-2">
        Net score vs. par next to each partner. <span className="text-emerald-400">Carried</span> = you
        out-scored your partner; <span className="text-orange-400">Leaned</span> = they carried you.
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.playerId} className="bg-neutral-800/60 rounded-lg px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-white text-sm font-semibold">{nameFor(row.playerId)}</span>
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
                  <div key={pr.partnerId + pr.rotation} className="flex items-center justify-between text-xs">
                    <span className="text-neutral-300">
                      with {nameFor(pr.partnerId)}
                      <span className="text-neutral-600">
                        {' '}· holes {(pr.rotation - 1) * 6 + 1}–{pr.rotation * 6}
                      </span>
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
  );
}
