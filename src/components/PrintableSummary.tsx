import { forwardRef } from 'react';
import { RoundExportData } from '../utils/export';
import { getNetScore } from '../utils/scoring';
import { computePerformances, findMVP, formatDifferential, gradeColor } from '../utils/performance';

interface Props {
  data: RoundExportData;
}

// Renders a clean, light-themed summary suitable for capturing to a PDF.
// Uses inline styles for html2canvas compatibility.
const PrintableSummary = forwardRef<HTMLDivElement, Props>(({ data }, ref) => {
  const { courseName, date, players, holes, matches, scores, results, pointValue } = data;

  // Player money
  const playerMoney = new Map<string, number>();
  players.forEach((p) => playerMoney.set(p.id, 0));
  matches.forEach((m) => {
    const r = results.find((res) => res.matchId === m.id);
    if (!r) return;
    m.team1.forEach((id) => playerMoney.set(id, (playerMoney.get(id) || 0) + r.money));
    m.team2.forEach((id) => playerMoney.set(id, (playerMoney.get(id) || 0) - r.money));
  });
  const moneyRanks = players
    .map((p) => ({ player: p, money: playerMoney.get(p.id) || 0 }))
    .sort((a, b) => b.money - a.money);

  // Performance (wins, ties, grades, MVP)
  const performances = computePerformances(players, holes, scores);
  const perfById = new Map(performances.map((pp) => [pp.playerId, pp]));
  const mvp = findMVP(performances);
  const holesWonRanks = players
    .map((p) => {
      const perf = perfById.get(p.id)!;
      return { player: p, won: perf.holesWon, tied: perf.holesTied };
    })
    .sort((a, b) => b.won - a.won || b.tied - a.tied);
  const gradeRanks = players
    .map((p) => ({ player: p, perf: perfById.get(p.id)! }))
    .sort((a, b) => b.perf.differential - a.perf.differential);

  // Partnerships
  const partnerMap = new Map<string, { ids: [string, string]; points: number }>();
  matches.forEach((m) => {
    const r = results.find((res) => res.matchId === m.id);
    if (!r) return;
    const pairs: { pair: [string, string]; points: number }[] = [
      { pair: m.team1, points: r.totalPoints },
      { pair: m.team2, points: -r.totalPoints },
    ];
    pairs.forEach(({ pair, points }) => {
      const key = [...pair].sort().join('|');
      const ex = partnerMap.get(key);
      if (ex) ex.points += points;
      else partnerMap.set(key, { ids: pair, points });
    });
  });
  const partnerRanks = Array.from(partnerMap.values()).sort((a, b) => b.points - a.points);
  const pName = (id: string) => players.find((p) => p.id === id)?.name || '?';

  // Styles
  const colors = {
    bg: '#ffffff',
    text: '#1a1a1a',
    muted: '#666666',
    red: '#c1121f',
    orange: '#d97706',
    gold: '#b8860b',
    lightBg: '#f5f5f5',
    border: '#d4d4d4',
  };
  const fontStack = "'Helvetica Neue', Helvetica, Arial, sans-serif";

  const section = (title: string, children: React.ReactNode) => (
    <div style={{ marginBottom: 18 }} data-pdf-section>
      <div
        style={{
          fontSize: 13,
          fontWeight: 700,
          color: colors.red,
          borderBottom: `2px solid ${colors.red}`,
          paddingBottom: 4,
          marginBottom: 8,
          letterSpacing: 1,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );

  const rankingRow = (idx: number, name: string, right: React.ReactNode) => {
    const rankColor =
      idx === 0 ? colors.gold : idx === 1 ? '#8a8a8a' : idx === 2 ? colors.orange : colors.muted;
    return (
      <div
        key={`${name}-${idx}`}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '6px 10px',
          backgroundColor: colors.lightBg,
          borderRadius: 4,
          marginBottom: 4,
          fontSize: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, color: rankColor, width: 20 }}>{idx + 1}.</span>
          <span style={{ fontWeight: 500 }}>{name}</span>
        </div>
        <div style={{ fontWeight: 700 }}>{right}</div>
      </div>
    );
  };

  // Scorecard cell with decorations based on gross vs par
  const cellSize = 22;
  const renderCell = (score: number | undefined, par: number) => {
    if (score == null) {
      return (
        <span
          style={{
            display: 'inline-flex',
            width: cellSize,
            height: cellSize,
            alignItems: 'center',
            justifyContent: 'center',
            color: colors.muted,
          }}
        >
          -
        </span>
      );
    }
    const diff = score - par;
    const base: React.CSSProperties = {
      display: 'inline-flex',
      width: cellSize,
      height: cellSize,
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: 11,
      fontWeight: 600,
      color: colors.text,
    };
    if (diff <= -2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${colors.red}`,
            borderRadius: 999,
            padding: 2,
          }}
        >
          <span
            style={{
              ...base,
              border: `1px solid ${colors.red}`,
              borderRadius: 999,
              color: colors.red,
            }}
          >
            {score}
          </span>
        </span>
      );
    }
    if (diff === -1) {
      return (
        <span
          style={{
            ...base,
            border: `1px solid ${colors.red}`,
            borderRadius: 999,
            color: colors.red,
          }}
        >
          {score}
        </span>
      );
    }
    if (diff === 1) {
      return (
        <span style={{ ...base, border: `1px solid ${colors.orange}`, color: colors.orange }}>
          {score}
        </span>
      );
    }
    if (diff >= 2) {
      return (
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: `1px solid ${colors.orange}`,
            padding: 2,
          }}
        >
          <span style={{ ...base, border: `1px solid ${colors.orange}`, color: colors.orange }}>
            {score}
          </span>
        </span>
      );
    }
    return <span style={base}>{score}</span>;
  };

  const frontNine = holes.filter((h) => h.number <= 9);
  const backNine = holes.filter((h) => h.number > 9);

  const renderNine = (label: string, nine: typeof holes, sumLabel: string) => {
    const parSum = nine.reduce((s, h) => s + h.par, 0);
    return (
      <div style={{ marginBottom: 12 }} data-pdf-section>
        <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>{label}</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ color: colors.muted, borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Hole</th>
              {nine.map((h) => (
                <th key={h.number} style={{ padding: '4px 2px', fontWeight: 600, textAlign: 'center' }}>
                  {h.number}
                </th>
              ))}
              <th style={{ padding: '4px 6px', fontWeight: 700, color: colors.gold, textAlign: 'center' }}>
                {sumLabel}
              </th>
            </tr>
            <tr style={{ color: colors.muted, borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>Par</th>
              {nine.map((h) => (
                <th key={h.number} style={{ padding: '4px 2px', fontWeight: 500, textAlign: 'center' }}>
                  {h.par}
                </th>
              ))}
              <th style={{ padding: '4px 6px', fontWeight: 600, textAlign: 'center' }}>{parSum}</th>
            </tr>
            <tr style={{ color: colors.muted, borderBottom: `1px solid ${colors.border}` }}>
              <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500 }}>HCP</th>
              {nine.map((h) => (
                <th key={h.number} style={{ padding: '4px 2px', fontWeight: 500, textAlign: 'center' }}>
                  {h.handicapRating}
                </th>
              ))}
              <th style={{ padding: '4px 6px' }}></th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => {
              const total = nine.reduce((s, h) => s + (scores[player.id]?.[h.number] || 0), 0);
              return (
                <tr key={player.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                  <td style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {player.name || '—'}
                  </td>
                  {nine.map((h) => (
                    <td key={h.number} style={{ padding: '3px 2px', textAlign: 'center' }}>
                      {renderCell(scores[player.id]?.[h.number], h.par)}
                    </td>
                  ))}
                  <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: colors.gold }}>
                    {total || '-'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div
      ref={ref}
      style={{
        width: 780,
        padding: 28,
        backgroundColor: colors.bg,
        color: colors.text,
        fontFamily: fontStack,
        fontSize: 12,
        boxSizing: 'border-box',
      }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 18, paddingBottom: 12, borderBottom: `3px double ${colors.red}` }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: colors.red, letterSpacing: 2 }}>
          VEGAS GOLF
        </div>
        <div style={{ fontSize: 11, color: colors.muted, letterSpacing: 2 }}>ROUND SUMMARY</div>
      </div>

      <div style={{ marginBottom: 18, fontSize: 12 }}>
        {courseName && (
          <div>
            <strong>Course:</strong> {courseName}
          </div>
        )}
        <div>
          <strong>Date:</strong> {new Date(date).toLocaleDateString()}
        </div>
        <div>
          <strong>Players:</strong> {players.map((p) => p.name).join(', ')}
        </div>
        <div>
          <strong>Point Value:</strong> ${pointValue.toFixed(2)} per point
        </div>
      </div>

      {/* Round MVP */}
      {mvp && mvp.holesPlayed > 0 && (
        <div
          data-pdf-section
          style={{
            marginBottom: 18,
            padding: 12,
            border: `2px solid ${colors.gold}`,
            borderRadius: 6,
            backgroundColor: '#fffbeb',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 28 }}>👑</div>
          <div style={{ flex: 1 }}>
            <div
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: colors.gold,
                letterSpacing: 2,
                textTransform: 'uppercase',
              }}
            >
              Round MVP
            </div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{mvp.name}</div>
            <div style={{ fontSize: 11, color: colors.muted }}>
              {mvp.holesWon} won · {mvp.holesTied} tied
              {(mvp.birdies > 0 || mvp.eagles > 0) && (
                <>
                  {' · '}
                  <span style={{ color: colors.red, fontWeight: 600 }}>
                    {mvp.birdies} birdie{mvp.birdies === 1 ? '' : 's'}
                    {mvp.eagles > 0 && `, ${mvp.eagles} eagle${mvp.eagles === 1 ? '' : 's'}`}
                  </span>
                </>
              )}
              {' · '}
              <span style={{ color: mvp.differential >= 0 ? colors.red : colors.orange, fontWeight: 600 }}>
                {formatDifferential(mvp.differential)} vs handicap
              </span>
            </div>
          </div>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              backgroundColor: gradeColor(mvp.grade),
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 22,
              fontWeight: 900,
            }}
          >
            {mvp.grade}
          </div>
        </div>
      )}

      {section(
        'MONEY LEADERBOARD',
        <div>
          {moneyRanks.map((r, i) =>
            rankingRow(
              i,
              r.player.name,
              <span style={{ color: r.money >= 0 ? colors.red : colors.orange }}>
                {r.money >= 0 ? '+' : '-'}${Math.abs(r.money).toFixed(2)}
              </span>
            )
          )}
        </div>
      )}

      {section(
        'HOLES WON (Low Gross)',
        <div>
          {holesWonRanks.map((r, i) =>
            rankingRow(
              i,
              r.player.name,
              <span>
                <span style={{ color: colors.red }}>{r.won} won</span>
                <span style={{ color: colors.muted, margin: '0 6px' }}>·</span>
                <span style={{ color: colors.gold }}>{r.tied} tied</span>
              </span>
            )
          )}
          <div style={{ fontSize: 10, color: colors.muted, marginTop: 4 }}>
            Only sole low gross counts as a win; ties are tracked separately.
          </div>
        </div>
      )}

      {partnerRanks.length > 0 &&
        section(
          'BEST PARTNERSHIPS',
          <div>
            {partnerRanks.map((pr, i) =>
              rankingRow(
                i,
                `${pName(pr.ids[0])} & ${pName(pr.ids[1])}`,
                <span style={{ color: pr.points >= 0 ? colors.red : colors.orange }}>
                  {pr.points >= 0 ? '+' : ''}
                  {pr.points} pts
                </span>
              )
            )}
          </div>
        )}

      {section(
        'PERFORMANCE GRADES',
        <div>
          {gradeRanks.map(({ player, perf }) => {
            const scoreStr =
              perf.holesPlayed === 0
                ? '-'
                : perf.scoreToPar === 0
                ? 'E'
                : perf.scoreToPar > 0
                ? `+${perf.scoreToPar}`
                : String(perf.scoreToPar);
            return (
              <div
                key={player.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  backgroundColor: colors.lightBg,
                  borderRadius: 4,
                  marginBottom: 4,
                  fontSize: 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      backgroundColor: gradeColor(perf.grade),
                      color: '#ffffff',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 900,
                    }}
                  >
                    {perf.grade}
                  </span>
                  <span style={{ fontWeight: 500 }}>{player.name}</span>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 10, color: colors.muted }}>
                    Hcp {player.handicap} · Shot {scoreStr}
                    {(perf.birdies > 0 || perf.eagles > 0) && (
                      <span style={{ color: colors.red, marginLeft: 6, fontWeight: 600 }}>
                        {perf.eagles > 0 && `${perf.eagles}E `}
                        {perf.birdies > 0 && `${perf.birdies}B`}
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      fontWeight: 700,
                      color: perf.differential >= 0 ? colors.red : colors.orange,
                    }}
                  >
                    {formatDifferential(perf.differential)} vs hcp
                  </div>
                </div>
              </div>
            );
          })}
          <div style={{ fontSize: 9, color: colors.muted, marginTop: 4 }}>
            Grade combines score vs handicap with holes won/tied and natural birdies/eagles. A ≥ +4, B ≥ +2, C ±1, D -2 to -4, F ≤ -5.
          </div>
        </div>
      )}

      {section(
        'SCORECARD',
        <div>
          {renderNine('Front 9', frontNine, 'OUT')}
          {renderNine('Back 9', backNine, 'IN')}

          {/* Totals */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: 12 }}>Totals</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${colors.border}`, color: colors.muted }}>
                  <th style={{ textAlign: 'left', padding: '4px 6px', fontWeight: 600 }}>Player</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>Gross</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>Net</th>
                  <th style={{ padding: '4px 6px', fontWeight: 600 }}>+/-</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  let gross = 0;
                  let net = 0;
                  let parPlayed = 0;
                  holes.forEach((h) => {
                    const g = scores[p.id]?.[h.number];
                    if (g != null) {
                      gross += g;
                      net += getNetScore(g, p.strokesReceived, h.handicapRating);
                      parPlayed += h.par;
                    }
                  });
                  const diff = gross - parPlayed;
                  const diffStr =
                    parPlayed === 0 ? '-' : diff === 0 ? 'E' : diff > 0 ? `+${diff}` : String(diff);
                  return (
                    <tr key={p.id} style={{ borderBottom: `1px solid ${colors.border}` }}>
                      <td style={{ padding: '4px 6px', fontWeight: 500 }}>{p.name || '—'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>{gross || '-'}</td>
                      <td style={{ padding: '4px 6px', textAlign: 'center' }}>{net || '-'}</td>
                      <td
                        style={{
                          padding: '4px 6px',
                          textAlign: 'center',
                          fontWeight: 600,
                          color: diff < 0 ? colors.red : diff > 0 ? colors.orange : colors.text,
                        }}
                      >
                        {diffStr}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section(
        'MATCH RESULTS',
        <div>
          {[1, 2, 3].map((rotation) => {
            const rotationMatches = matches.filter((m) => m.rotation === rotation);
            if (rotationMatches.length === 0) return null;
            const start = (rotation - 1) * 6 + 1;
            const end = rotation * 6;
            return (
              <div key={rotation} style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 600, color: colors.red, fontSize: 12, marginBottom: 4 }}>
                  Rotation {rotation} (Holes {start}-{end})
                </div>
                {rotationMatches.map((m) => {
                  const r = results.find((res) => res.matchId === m.id);
                  if (!r) return null;
                  const winner =
                    r.totalPoints > 0 ? r.team1Names : r.totalPoints < 0 ? r.team2Names : null;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '6px 10px',
                        backgroundColor: colors.lightBg,
                        borderRadius: 4,
                        marginBottom: 3,
                        fontSize: 11,
                      }}
                    >
                      <div>
                        <span style={{ color: colors.red, fontWeight: 600 }}>{r.team1Names}</span>
                        <span style={{ color: colors.muted, margin: '0 6px' }}>vs</span>
                        <span style={{ color: colors.orange, fontWeight: 600 }}>{r.team2Names}</span>
                      </div>
                      <div style={{ fontWeight: 700 }}>
                        <span
                          style={{
                            color:
                              r.totalPoints > 0
                                ? colors.red
                                : r.totalPoints < 0
                                ? colors.orange
                                : colors.muted,
                          }}
                        >
                          {r.totalPoints > 0 ? '+' : ''}
                          {r.totalPoints} pts
                        </span>
                        {winner && (
                          <span style={{ color: colors.muted, marginLeft: 8 }}>
                            ${Math.abs(r.money).toFixed(2)} to {winner}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer */}
      <div
        style={{
          marginTop: 20,
          paddingTop: 10,
          borderTop: `1px solid ${colors.border}`,
          fontSize: 9,
          color: colors.muted,
          textAlign: 'center',
        }}
      >
        Generated by Vegas Golf Tracker · {new Date().toLocaleString()}
      </div>
    </div>
  );
});

PrintableSummary.displayName = 'PrintableSummary';

export default PrintableSummary;
