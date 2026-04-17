import { useState } from 'react';
import type { Tournament, TourPlayer } from '../types';
import { applyAllowance, courseHandicap } from '../ghin';
import { generateId } from '../useTournament';

interface Props {
  tournament: Tournament;
  onAddPlayer: (player: TourPlayer) => void;
  onUpdatePlayer: (id: string, patch: Partial<TourPlayer>) => void;
  onRemovePlayer: (id: string) => void;
  onBack: () => void;
}

/**
 * Public-facing registration page. Anyone with the link can add themselves
 * to the field for the day. Organizers later hit "Randomize foursomes" in
 * setup to turn the roster into groups.
 */
export default function Registration({ tournament, onAddPlayer, onUpdatePlayer, onRemovePlayer, onBack }: Props) {
  const [name, setName] = useState('');
  const [ghin, setGhin] = useState('');
  const [index, setIndex] = useState<string>('');
  const [status, setStatus] = useState<{ type: 'idle' | 'ok' | 'err'; message?: string }>({ type: 'idle' });
  const [editingPlayer, setEditingPlayer] = useState<TourPlayer | null>(null);
  const [editName, setEditName] = useState('');
  const [editIndex, setEditIndex] = useState('');

  const players = Object.values(tournament.players);

  const handleSubmit = () => {
    if (!name.trim()) {
      setStatus({ type: 'err', message: 'Enter your name' });
      return;
    }
    const idx = Number(index) || 0;
    const ch = applyAllowance(courseHandicap(idx, 132, 70, 68), tournament.handicapAllowance);
    onAddPlayer({
      id: generateId(),
      name: name.trim(),
      ghinNumber: ghin.trim() || undefined,
      handicapIndex: idx,
      courseHandicap: ch,
    });
    setName('');
    setGhin('');
    setIndex('');
    setStatus({ type: 'ok', message: 'Signed up!' });
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 p-4 pb-12">
      <header className="flex items-center justify-between mb-4">
        <button onClick={onBack} className="text-sm text-neutral-400">
          ←
        </button>
        <div className="text-center">
          <div className="text-xs text-neutral-500 uppercase tracking-widest">Sign up</div>
          <div className="font-bold">{tournament.name}</div>
        </div>
        <div className="w-6" />
      </header>

      <div className="text-xs text-neutral-500 mb-4 text-center">
        {tournament.courseName} · {tournament.date}
      </div>

      <section className="bg-neutral-900 rounded-xl p-4 space-y-3 mb-6">
        <label className="block">
          <div className="text-xs text-neutral-400 uppercase mb-1">Name</div>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            className="input"
          />
        </label>

        <label className="block">
          <div className="text-xs text-neutral-400 uppercase mb-1">GHIN # (optional)</div>
          <input
            value={ghin}
            onChange={(e) => setGhin(e.target.value)}
            placeholder="e.g. 1234567"
            className="input"
            inputMode="numeric"
          />
        </label>

        <label className="block">
          <div className="text-xs text-neutral-400 uppercase mb-1">Handicap index</div>
          <input
            value={index}
            onChange={(e) => setIndex(e.target.value)}
            placeholder="e.g. 12.4"
            className="input"
            inputMode="decimal"
          />
        </label>

        {status.message && (
          <div
            className={`text-sm ${status.type === 'err' ? 'text-red-400' : 'text-emerald-400'}`}
          >
            {status.message}
          </div>
        )}

        <button
          onClick={handleSubmit}
          className="w-full py-3 bg-emerald-600 rounded-lg font-bold text-white"
        >
          Sign me up
        </button>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs uppercase tracking-widest text-neutral-500">
            Registered ({players.length})
          </h2>
        </div>
        {players.length === 0 ? (
          <p className="text-sm text-neutral-500">Be the first to sign up.</p>
        ) : (
          <div className="space-y-1">
            {players.map((p) => (
              <div
                key={p.id}
                className="bg-neutral-900 rounded-lg px-3 py-2 flex items-center justify-between text-sm"
              >
                <div>
                  <div>{p.name}</div>
                  <div className="text-xs text-neutral-500">
                    Index {p.handicapIndex} · CH {p.courseHandicap}
                  </div>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setEditingPlayer(p);
                      setEditName(p.name);
                      setEditIndex(String(p.handicapIndex));
                    }}
                    className="text-xs text-emerald-400"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`Remove ${p.name}?`)) onRemovePlayer(p.id);
                    }}
                    className="text-xs text-neutral-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editingPlayer && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-neutral-900 rounded-xl p-4 w-full max-w-sm space-y-3">
            <h3 className="font-bold text-lg">Edit player</h3>
            <label className="block">
              <div className="text-xs text-neutral-400 uppercase mb-1">Name</div>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="input"
              />
            </label>
            <label className="block">
              <div className="text-xs text-neutral-400 uppercase mb-1">Handicap Index</div>
              <input
                value={editIndex}
                onChange={(e) => setEditIndex(e.target.value)}
                inputMode="decimal"
                className="input"
              />
            </label>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setEditingPlayer(null)}
                className="flex-1 py-2 bg-neutral-800 text-neutral-300 rounded-lg text-sm"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const idx = Number(editIndex) || 0;
                  const ch = applyAllowance(
                    courseHandicap(idx, 132, 70, 68),
                    tournament.handicapAllowance,
                  );
                  onUpdatePlayer(editingPlayer.id, {
                    name: editName.trim() || editingPlayer.name,
                    handicapIndex: idx,
                    courseHandicap: ch,
                  });
                  setEditingPlayer(null);
                }}
                className="flex-1 py-2 bg-emerald-600 text-white rounded-lg text-sm font-bold"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .input {
          background: #171717;
          border: 1px solid #262626;
          color: #fafafa;
          padding: 0.6rem 0.75rem;
          border-radius: 0.5rem;
          width: 100%;
          font-size: 0.95rem;
        }
        .input:focus { outline: none; border-color: #059669; }
      `}</style>
    </div>
  );
}
