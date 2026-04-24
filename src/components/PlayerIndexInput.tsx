import { useEffect, useState } from 'react';

/**
 * Format an internal signed handicap index as a display string.
 * Golf convention: plus handicaps (better than scratch) are shown as "+N",
 * and stored internally as a negative number.
 */
export function formatIndex(n: number): string {
  if (!n) return '';
  if (n < 0) return `+${Math.abs(n)}`;
  return String(n);
}

/** Parse user input accepting "+N", "-N", or "N". "+" prefix = plus handicap = negative. */
export function parseIndex(s: string): number {
  const t = s.trim();
  if (!t || t === '+' || t === '-' || t === '.') return 0;
  if (t.startsWith('+')) {
    const n = parseFloat(t.slice(1));
    return Number.isFinite(n) ? -n : 0;
  }
  const n = parseFloat(t);
  return Number.isFinite(n) ? n : 0;
}

/** Format a computed course handicap for display, using "+N" for plus handicaps. */
export function formatHandicap(n: number): string {
  if (n < 0) return `+${Math.abs(n)}`;
  return String(n);
}

interface Props {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}

export default function PlayerIndexInput({ value, onChange, className, placeholder }: Props) {
  const [raw, setRaw] = useState<string>(() => formatIndex(value));

  // Resync local text when the numeric prop drifts from what's displayed (e.g.
  // a remote Firebase update or loading a saved round).
  useEffect(() => {
    if (parseIndex(raw) !== value) {
      setRaw(formatIndex(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={raw}
      onChange={(e) => {
        const s = e.target.value;
        setRaw(s);
        onChange(parseIndex(s));
      }}
      placeholder={placeholder ?? '0.0 or +2.5'}
      className={className}
    />
  );
}
