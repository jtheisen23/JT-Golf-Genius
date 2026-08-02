import { useState } from 'react';
import { fetchGhinIndex, applyAllowance, courseHandicap } from '../ghin';
import { generateId } from '../useTournament';
import { holeParsTotal } from '../scoring';
import { randomizeGroups } from '../randomize';
import { parseIndex, formatIndex, formatHandicap } from '../../components/PlayerIndexInput';
import { PLAY_DAYS, PLAY_DAY_LABELS, nextDateForDay } from '../dateUtils';
import { blankHoles, GENEVA_COURSE } from '../../utils/courses';
import { useCourses } from '../../hooks/useCourses';
import type { Course } from '../../types';
import type { PlayDay, Tournament, TourGroup, TourHole, TourPlayer } from '../types';

interface Props {
  tournament: Tournament;
  onAddPlayer: (p: TourPlayer) => void;
  onUpdatePlayer: (id: string, patch: Partial<TourPlayer>) => void;
  onRemovePlayer: (id: string) => void;
  onAddGroup: (group: { id: string; name: string; playerIds: string[]; teeTime?: string }) => void;
  onUpdateGroup: (id: string, patch: { name?: string; playerIds?: string[]; teeTime?: string }) => void;
  onRemoveGroup: (id: string) => void;
  onSetGroups: (groups: TourGroup[]) => void;
  onUpdateHole: (n: number, patch: { par?: number; handicapRating?: number }) => void;
  onUpdateMeta: (
    patch: Partial<
      Pick<
        Tournament,
        | 'name'
        | 'courseName'
        | 'slope'
        | 'courseRating'
        | 'holes'
        | 'date'
        | 'format'
        | 'handicapAllowance'
        | 'handicapMode'
        | 'playDay'
        | 'startTime'
        | 'teeTimeInterval'
      >
    >,
  ) => void;
  onStart: () => void;
}

type Tab = 'details' | 'players' | 'groups' | 'holes';

export default function TournamentSetup({
  tournament,
  onAddPlayer,
  onUpdatePlayer,
  onRemovePlayer,
  onAddGroup,
  onUpdateGroup,
  onRemoveGroup,
  onSetGroups,
  onUpdateHole,
  onUpdateMeta,
  onStart,
}: Props) {
  const [tab, setTab] = useState<Tab>('details');
  const [ghinLookup, setGhinLookup] = useState<Record<string, { loading: boolean; error?: string }>>({});

  const players = Object.values(tournament.players);
  const assignedIds = new Set(tournament.groups.flatMap((g) => g.playerIds));
  const unassigned = players.filter((p) => !assignedIds.has(p.id));

  // Course rating numbers used for course-handicap math. Fall back to Geneva's
  // values for tournaments created before slope/rating were stored.
  const slope = tournament.slope ?? GENEVA_COURSE.slope;
  const courseRating = tournament.courseRating ?? GENEVA_COURSE.courseRating;
  const coursePar = holeParsTotal(tournament.holes);

  const recomputeCourseHandicap = (
    p: TourPlayer,
    s = slope,
    r = courseRating,
    par = coursePar,
  ): number => applyAllowance(courseHandicap(p.handicapIndex, s, r, par), tournament.handicapAllowance);

  // Recompute every player's course handicap against the given course numbers.
  // Called from every course-affecting edit so no player is left on a stale value.
  const recalcAllHandicaps = (s = slope, r = courseRating, par = coursePar) => {
    players.forEach((p) =>
      onUpdatePlayer(p.id, { courseHandicap: recomputeCourseHandicap(p, s, r, par) }),
    );
  };

  // Course library: Geneva (built-in) + any user-added courses, synced across
  // devices through Firebase.
  const { courses, saveCourse, deleteCourse } = useCourses();
  // `null` = follow the tournament's current course automatically; an explicit
  // '' means the user diverged (Custom); a real id means a chosen course.
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [draft, setDraft] = useState<Course>(() => ({
    id: '',
    name: '',
    slope: 113,
    courseRating: 72,
    holes: blankHoles(),
  }));

  // Derived selection: when the user hasn't explicitly chosen, match the
  // tournament's current course against the (live) library. This resolves
  // correctly once the Firebase-synced list arrives on a fresh device.
  const matchedCourse = courses.find(
    (c) => c.name === tournament.courseName && c.slope === slope && c.courseRating === courseRating,
  );
  const selectedValue = selectedCourseId ?? matchedCourse?.id ?? '';

  // Apply a saved course: set name, slope, rating and per-hole pars in one meta
  // write, then recompute every player's course handicap against the new numbers.
  const applyCourse = (course: Course) => {
    const holes: TourHole[] = course.holes.map((h) => ({
      number: h.number,
      par: h.par,
      handicapRating: h.handicapRating,
    }));
    const par = holes.reduce((sum, h) => sum + h.par, 0);
    onUpdateMeta({
      courseName: course.name,
      slope: course.slope,
      courseRating: course.courseRating,
      holes,
    });
    recalcAllHandicaps(course.slope, course.courseRating, par);
  };

  const handleSelectCourse = (id: string) => {
    const course = courses.find((c) => c.id === id);
    if (!course) return;
    setSelectedCourseId(id);
    applyCourse(course);
  };

  const startAddCourse = () => {
    setDraft({ id: '', name: '', slope: 113, courseRating: 72, holes: blankHoles() });
    setShowAddCourse(true);
  };

  const updateDraftHole = (holeNum: number, field: 'par' | 'handicapRating', value: number) => {
    setDraft((prev) => ({
      ...prev,
      holes: prev.holes.map((h) => (h.number === holeNum ? { ...h, [field]: value } : h)),
    }));
  };

  const draftPar = draft.holes.reduce((sum, h) => sum + h.par, 0);

  const handleSaveCourse = () => {
    const name = draft.name.trim();
    if (!name) return;
    const newCourse: Course = { ...draft, name, id: `course-${generateId()}` };
    saveCourse(newCourse);
    setSelectedCourseId(newCourse.id);
    applyCourse(newCourse);
    setShowAddCourse(false);
  };

  const handleDeleteCourse = () => {
    if (!selectedValue || selectedValue === GENEVA_COURSE.id) return;
    if (!confirm('Delete this course? This cannot be undone.')) return;
    deleteCourse(selectedValue);
    setSelectedCourseId(GENEVA_COURSE.id);
    applyCourse(GENEVA_COURSE);
  };

  const handleAddPlayer = () => {
    const id = generateId();
    onAddPlayer({
      id,
      name: '',
      handicapIndex: 0,
      courseHandicap: 0,
    });
  };

  const handleGhinLookup = async (playerId: string, ghinNumber: string) => {
    setGhinLookup((s) => ({ ...s, [playerId]: { loading: true } }));
    try {
      const result = await fetchGhinIndex(ghinNumber);
      const patch: Partial<TourPlayer> = {
        ghinNumber: result.ghinNumber,
        handicapIndex: result.handicapIndex,
      };
      if (!tournament.players[playerId].name) patch.name = result.name;
      onUpdatePlayer(playerId, patch);
      const ch = applyAllowance(
        courseHandicap(result.handicapIndex, slope, courseRating, coursePar),
        tournament.handicapAllowance,
      );
      onUpdatePlayer(playerId, { courseHandicap: ch });
      setGhinLookup((s) => ({ ...s, [playerId]: { loading: false } }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Lookup failed';
      setGhinLookup((s) => ({ ...s, [playerId]: { loading: false, error: message } }));
    }
  };

  const handleAddGroup = () => {
    const num = tournament.groups.length + 1;
    onAddGroup({ id: generateId(), name: `Group ${num}`, playerIds: [] });
  };

  const handleRandomize = () => {
    if (players.length === 0) return;
    const ok =
      tournament.groups.length === 0 ||
      confirm(
        'Replace existing groups with a fresh random draw? Posted scores will stay on their current groups but unassigned groups will be removed.',
      );
    if (!ok) return;
    onSetGroups(
      randomizeGroups(
        players,
        4,
        'Group',
        tournament.startTime || '08:00',
        tournament.teeTimeInterval ?? 12,
      ),
    );
  };

  const canStart =
    tournament.name.trim().length > 0 &&
    players.length > 0 &&
    players.every((p) => p.name.trim()) &&
    tournament.groups.length > 0 &&
    tournament.groups.every((g) => g.playerIds.length > 0);

  return (
    <div className="min-h-screen bg-black p-4 pb-24 text-neutral-100">
      <header className="mb-4">
        <div className="text-xs text-neutral-500 uppercase tracking-widest">Tournament Setup</div>
        <h1 className="text-2xl font-bold">{tournament.name || 'New Tournament'}</h1>
        <p className="text-sm text-neutral-400">{tournament.courseName}</p>
      </header>

      <nav className="flex gap-1 mb-4 overflow-x-auto text-sm">
        {(['details', 'players', 'groups', 'holes'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full whitespace-nowrap ${
              tab === t ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-neutral-400'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      {tab === 'details' && (
        <section className="space-y-3">
          <Field label="Event name">
            <input
              value={tournament.name}
              onChange={(e) => onUpdateMeta({ name: e.target.value })}
              className="input"
              placeholder="Spring Invitational"
            />
          </Field>
          <div className="bg-neutral-900 rounded-lg p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-neutral-400 uppercase tracking-wide">Course</div>
              <button
                type="button"
                onClick={startAddCourse}
                className="text-xs bg-emerald-700 text-white px-2.5 py-1 rounded"
              >
                + Add course
              </button>
            </div>
            <select
              value={selectedValue}
              onChange={(e) => handleSelectCourse(e.target.value)}
              className="input"
            >
              {selectedValue === '' && <option value="">Custom (unsaved)</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — Slope {c.slope} / Rating {c.courseRating}
                </option>
              ))}
            </select>
            <Field label="Course name">
              <input
                value={tournament.courseName}
                onChange={(e) => {
                  onUpdateMeta({ courseName: e.target.value });
                  setSelectedCourseId('');
                }}
                className="input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Slope">
                <input
                  type="number"
                  value={slope}
                  min={55}
                  max={155}
                  onChange={(e) => {
                    const newSlope = parseInt(e.target.value) || GENEVA_COURSE.slope;
                    onUpdateMeta({ slope: newSlope });
                    setSelectedCourseId('');
                    recalcAllHandicaps(newSlope, courseRating, coursePar);
                  }}
                  className="input"
                />
              </Field>
              <Field label="Rating">
                <input
                  type="number"
                  step="0.1"
                  value={courseRating}
                  onChange={(e) => {
                    const newRating = parseFloat(e.target.value) || GENEVA_COURSE.courseRating;
                    onUpdateMeta({ courseRating: newRating });
                    setSelectedCourseId('');
                    recalcAllHandicaps(slope, newRating, coursePar);
                  }}
                  className="input"
                />
              </Field>
            </div>
            {selectedValue && selectedValue !== GENEVA_COURSE.id && (
              <button
                type="button"
                onClick={handleDeleteCourse}
                className="text-xs text-red-400"
              >
                Delete this course
              </button>
            )}
            {players.length > 0 && (
              <div className="space-y-2 pt-1">
                <div className="text-[11px] text-neutral-500">
                  Course handicaps · Slope {slope} / Rating {courseRating} / Par {coursePar}
                </div>
                <div className="space-y-1">
                  {players.map((p) => {
                    const preview = recomputeCourseHandicap(p);
                    const stale = preview !== p.courseHandicap;
                    return (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <span className="text-neutral-300">
                          {p.name || '(no name)'} · idx {formatIndex(p.handicapIndex)}
                        </span>
                        <span className={stale ? 'text-amber-400' : 'text-neutral-400'}>
                          CH {formatHandicap(preview)}
                          {stale && (
                            <span className="text-neutral-500">
                              {' '}(stored {formatHandicap(p.courseHandicap)})
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => recalcAllHandicaps()}
                  className="w-full text-sm bg-emerald-700 active:bg-emerald-800 text-white py-2.5 rounded font-semibold"
                >
                  Recalculate course handicaps
                </button>
              </div>
            )}
            <p className="text-[11px] text-neutral-500">
              Pick a course to fill in its slope, rating and pars. Geneva Golf Club is the default
              and can't be removed. Edit pars on the Holes tab.
            </p>
          </div>

          {showAddCourse && (
            <div className="bg-neutral-900 rounded-lg p-3 space-y-3 border border-emerald-700/40">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold text-emerald-300">New course</div>
                <button
                  type="button"
                  onClick={() => setShowAddCourse(false)}
                  className="text-xs text-neutral-400"
                >
                  Cancel
                </button>
              </div>
              <Field label="Course name">
                <input
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Pebble Beach"
                  className="input"
                />
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Slope">
                  <input
                    type="number"
                    value={draft.slope}
                    min={55}
                    max={155}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, slope: parseInt(e.target.value) || 113 }))
                    }
                    className="input"
                  />
                </Field>
                <Field label="Rating">
                  <input
                    type="number"
                    step="0.1"
                    value={draft.courseRating}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, courseRating: parseFloat(e.target.value) || 72 }))
                    }
                    className="input"
                  />
                </Field>
              </div>
              <div className="text-xs text-neutral-400 uppercase tracking-wide">
                Par &amp; SI by hole (par {draftPar})
              </div>
              <div className="grid grid-cols-[40px_1fr_1fr] gap-1 text-[10px] text-neutral-500 uppercase px-1">
                <div>#</div>
                <div>Par</div>
                <div>SI</div>
              </div>
              <div className="space-y-1 max-h-64 overflow-y-auto">
                {draft.holes.map((h) => (
                  <div key={h.number} className="grid grid-cols-[40px_1fr_1fr] gap-1 items-center">
                    <div className="text-neutral-400 text-sm">{h.number}</div>
                    <input
                      type="number"
                      value={h.par}
                      onChange={(e) => updateDraftHole(h.number, 'par', Number(e.target.value))}
                      className="input"
                    />
                    <input
                      type="number"
                      value={h.handicapRating}
                      onChange={(e) => updateDraftHole(h.number, 'handicapRating', Number(e.target.value))}
                      className="input"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={handleSaveCourse}
                disabled={!draft.name.trim()}
                className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold text-sm disabled:opacity-40"
              >
                Save course
              </button>
            </div>
          )}
          <Field label="Date">
            <input
              type="date"
              value={tournament.date}
              onChange={(e) => onUpdateMeta({ date: e.target.value })}
              className="input"
            />
          </Field>
          <Field label="Weekly play day">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => onUpdateMeta({ playDay: undefined })}
                className={`flex-1 py-2 rounded text-sm font-semibold ${
                  !tournament.playDay
                    ? 'bg-neutral-700 text-white'
                    : 'bg-neutral-900 text-neutral-400'
                }`}
              >
                One-off
              </button>
              {PLAY_DAYS.map((d: PlayDay) => (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    onUpdateMeta({ playDay: d, date: nextDateForDay(d) })
                  }
                  className={`flex-1 py-2 rounded text-sm font-semibold ${
                    tournament.playDay === d
                      ? d === 'friday'
                        ? 'bg-sky-600 text-white'
                        : 'bg-amber-600 text-white'
                      : 'bg-neutral-900 text-neutral-400'
                  }`}
                >
                  {PLAY_DAY_LABELS[d]}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Format">
            <select
              value={tournament.format}
              onChange={(e) => onUpdateMeta({ format: e.target.value as Tournament['format'] })}
              className="input"
            >
              <option value="stroke">Stroke play</option>
              <option value="stableford">Stableford</option>
              <option value="both">Both (stroke primary, stableford column)</option>
            </select>
          </Field>
          <Field label="Handicap allowance (%)">
            <input
              type="number"
              value={tournament.handicapAllowance}
              onChange={(e) => onUpdateMeta({ handicapAllowance: Number(e.target.value) })}
              className="input"
              min={0}
              max={100}
            />
          </Field>
          <Field label="Vegas handicap mode">
            <div className="flex gap-1">
              {([
                ['off-the-low', 'Off the Low'],
                ['full', 'Full Handicap'],
              ] as const).map(([mode, label]) => {
                const active = (tournament.handicapMode ?? 'off-the-low') === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => onUpdateMeta({ handicapMode: mode })}
                    className={`flex-1 py-2 rounded text-sm font-semibold ${
                      active ? 'bg-emerald-600 text-white' : 'bg-neutral-900 text-neutral-400'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {(tournament.handicapMode ?? 'off-the-low') === 'off-the-low'
                ? 'Strokes in the Vegas game are relative to the lowest handicap.'
                : 'Each player gets their full handicap strokes in the Vegas game.'}
            </p>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="First tee time">
              <input
                type="time"
                value={tournament.startTime || '08:00'}
                onChange={(e) => onUpdateMeta({ startTime: e.target.value })}
                className="input"
              />
            </Field>
            <Field label="Interval (min)">
              <input
                type="number"
                value={tournament.teeTimeInterval ?? 12}
                onChange={(e) =>
                  onUpdateMeta({ teeTimeInterval: Math.max(1, Number(e.target.value) || 12) })
                }
                className="input"
                min={1}
                max={60}
              />
            </Field>
          </div>
          <p className="text-xs text-neutral-500 -mt-1">
            When you Randomize groups, the first group gets this start time and each
            subsequent group is spaced by the interval above.
          </p>
        </section>
      )}

      {tab === 'players' && (
        <section className="space-y-3">
          {players.length === 0 && (
            <p className="text-sm text-neutral-500">No players yet — add one below.</p>
          )}
          {players.map((p) => {
            const lk = ghinLookup[p.id];
            return (
              <div key={p.id} className="bg-neutral-900 rounded-lg p-3 space-y-2">
                <div className="flex gap-2">
                  <input
                    value={p.name}
                    onChange={(e) => onUpdatePlayer(p.id, { name: e.target.value })}
                    placeholder="Player name"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => onRemovePlayer(p.id)}
                    className="px-3 py-2 text-xs bg-red-900/40 text-red-300 rounded"
                  >
                    Remove
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    value={p.ghinNumber || ''}
                    onChange={(e) => onUpdatePlayer(p.id, { ghinNumber: e.target.value })}
                    placeholder="GHIN #"
                    className="input flex-1"
                  />
                  <button
                    onClick={() => p.ghinNumber && handleGhinLookup(p.id, p.ghinNumber)}
                    disabled={!p.ghinNumber || lk?.loading}
                    className="px-3 py-2 text-xs bg-emerald-800 text-emerald-100 rounded disabled:opacity-40"
                  >
                    {lk?.loading ? '…' : 'Lookup'}
                  </button>
                </div>
                {lk?.error && <div className="text-xs text-red-400">{lk.error}</div>}
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Handicap index">
                    <input
                      type="text"
                      value={formatIndex(p.handicapIndex)}
                      placeholder="e.g. 12.4 or +2.3"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(e) => {
                        const idx = parseIndex(e.target.value);
                        onUpdatePlayer(p.id, {
                          handicapIndex: idx,
                          courseHandicap: recomputeCourseHandicap({ ...p, handicapIndex: idx }),
                        });
                      }}
                      className="input"
                    />
                  </Field>
                  <Field label="Course hdcp">
                    <input
                      type="text"
                      value={formatHandicap(p.courseHandicap)}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
                      onChange={(e) => onUpdatePlayer(p.id, { courseHandicap: parseIndex(e.target.value) })}
                      className="input"
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <button
            onClick={handleAddPlayer}
            className="w-full py-3 rounded-lg bg-emerald-700 text-white font-semibold"
          >
            + Add player
          </button>
        </section>
      )}

      {tab === 'groups' && (
        <section className="space-y-4">
          <div className="bg-emerald-900/30 border border-emerald-700/40 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-emerald-200">Random foursomes</div>
                <div className="text-xs text-emerald-300/70">
                  Shuffle the {players.length} registered player{players.length === 1 ? '' : 's'} into groups of 4.
                </div>
              </div>
              <button
                onClick={handleRandomize}
                disabled={players.length === 0}
                className="px-3 py-2 bg-emerald-600 text-white rounded font-semibold text-sm disabled:opacity-40 whitespace-nowrap"
              >
                Randomize
              </button>
            </div>
          </div>

          {unassigned.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700/40 rounded-lg p-3 text-sm">
              <strong>Unassigned:</strong>{' '}
              {unassigned.map((p) => p.name || '(no name)').join(', ')}
            </div>
          )}
          {tournament.groups.map((g) => (
            <div key={g.id} className="bg-neutral-900 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <input
                  value={g.name}
                  onChange={(e) => onUpdateGroup(g.id, { name: e.target.value })}
                  className="input flex-1"
                />
                <input
                  value={g.teeTime || ''}
                  onChange={(e) => onUpdateGroup(g.id, { teeTime: e.target.value })}
                  placeholder="Tee time"
                  className="input w-28"
                />
                <button
                  onClick={() => onRemoveGroup(g.id)}
                  className="px-3 py-2 text-xs bg-red-900/40 text-red-300 rounded"
                >
                  ✕
                </button>
              </div>
              <div className="space-y-1">
                {players.map((p) => {
                  const inGroup = g.playerIds.includes(p.id);
                  const inOtherGroup =
                    !inGroup && tournament.groups.some((og) => og.id !== g.id && og.playerIds.includes(p.id));
                  return (
                    <label
                      key={p.id}
                      className={`flex items-center gap-2 text-sm py-1 ${
                        inOtherGroup ? 'opacity-40' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={inGroup}
                        disabled={inOtherGroup}
                        onChange={() => {
                          const next = inGroup
                            ? g.playerIds.filter((id) => id !== p.id)
                            : [...g.playerIds, p.id];
                          onUpdateGroup(g.id, { playerIds: next });
                        }}
                      />
                      <span>{p.name || '(no name)'}</span>
                      <span className="text-xs text-neutral-500 ml-auto">
                        CH {formatHandicap(p.courseHandicap)}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          <button
            onClick={handleAddGroup}
            className="w-full py-3 rounded-lg bg-emerald-700 text-white font-semibold"
          >
            + Add group
          </button>
        </section>
      )}

      {tab === 'holes' && (
        <section>
          <div className="grid grid-cols-[40px_1fr_1fr] gap-1 text-xs text-neutral-500 uppercase mb-1 px-1">
            <div>#</div>
            <div>Par</div>
            <div>SI</div>
          </div>
          <div className="space-y-1">
            {tournament.holes.map((h) => (
              <div key={h.number} className="grid grid-cols-[40px_1fr_1fr] gap-1 items-center">
                <div className="text-neutral-400 text-sm">{h.number}</div>
                <input
                  type="number"
                  value={h.par}
                  onChange={(e) => {
                    const newPar = Number(e.target.value);
                    onUpdateHole(h.number, { par: newPar });
                    setSelectedCourseId('');
                    // Par change shifts the (rating − par) term, so recompute
                    // handicaps against the new total par.
                    recalcAllHandicaps(slope, courseRating, coursePar - h.par + newPar);
                  }}
                  className="input"
                />
                <input
                  type="number"
                  value={h.handicapRating}
                  onChange={(e) => {
                    onUpdateHole(h.number, { handicapRating: Number(e.target.value) });
                    setSelectedCourseId('');
                  }}
                  className="input"
                />
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="fixed bottom-0 left-0 right-0 bg-black/90 border-t border-neutral-800 p-3">
        <button
          onClick={onStart}
          disabled={!canStart}
          className="w-full py-3 rounded-lg bg-emerald-600 text-white font-bold disabled:opacity-40"
        >
          Start tournament
        </button>
        {!canStart && (
          <p className="text-xs text-neutral-500 mt-2 text-center">
            Add an event name, players with names, and at least one group with players assigned.
          </p>
        )}
      </div>

      <style>{`
        .input {
          background: #171717;
          border: 1px solid #262626;
          color: #fafafa;
          padding: 0.5rem 0.75rem;
          border-radius: 0.5rem;
          width: 100%;
          font-size: 0.9rem;
        }
        .input:focus {
          outline: none;
          border-color: #059669;
        }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs text-neutral-400 uppercase tracking-wide mb-1">{label}</div>
      {children}
    </label>
  );
}
