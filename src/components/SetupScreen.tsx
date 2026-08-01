import { useState } from 'react';
import { Player, Match, HoleSetup, HandicapMode, Course } from '../types';
import PlayerIndexInput, { formatHandicap } from './PlayerIndexInput';
import {
  getAllCourses,
  saveCustomCourse,
  deleteCustomCourse,
  blankHoles,
  GENEVA_COURSE,
} from '../utils/courses';

interface Props {
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  courseName: string;
  pointValue: number;
  slope: number;
  courseRating: number;
  onUpdatePlayer: (id: string, field: keyof Player, value: string | number) => void;
  onAddPlayer: () => void;
  onRemovePlayer: (id: string) => void;
  onUpdateHole: (holeNum: number, field: keyof HoleSetup, value: number) => void;
  onSetHoles: (holes: HoleSetup[]) => void;
  onAutoGenerateMatches: () => void;
  onAddMatch: (team1: [string, string], team2: [string, string], rotation: number) => void;
  onRemoveMatch: (matchId: string) => void;
  onSetMatches: (matches: Match[]) => void;
  onSetCourseName: (name: string) => void;
  onSetPointValue: (value: number) => void;
  onSetSlope: (value: number) => void;
  onSetCourseRating: (value: number) => void;
  handicapMode: HandicapMode;
  onSetHandicapMode: (mode: HandicapMode) => void;
  onStart: () => void;
  onNewGame: () => void;
}

type SetupStep = 'players' | 'course' | 'matches';

export default function SetupScreen({
  players,
  holes,
  matches,
  courseName,
  pointValue,
  slope,
  courseRating,
  onUpdatePlayer,
  onAddPlayer,
  onRemovePlayer,
  onUpdateHole,
  onSetHoles,
  onAutoGenerateMatches,
  onRemoveMatch,
  onSetMatches,
  onSetCourseName,
  onSetPointValue,
  onSetSlope,
  onSetCourseRating,
  handicapMode,
  onSetHandicapMode,
  onAddMatch,
  onStart,
  onNewGame,
}: Props) {
  const handleNewGame = () => {
    const ok = window.confirm(
      'Start a new game? This will clear all players, handicaps, and matches. The course setup will be kept.'
    );
    if (ok) onNewGame();
  };
  const [step, setStep] = useState<SetupStep>('players');
  const [newMatchRotation, setNewMatchRotation] = useState(1);
  const [newMatchTeam1, setNewMatchTeam1] = useState<[string, string]>(['', '']);
  const [newMatchTeam2, setNewMatchTeam2] = useState<[string, string]>(['', '']);

  // Course library: Geneva (built-in) + any user-added courses from localStorage.
  const [courses, setCourses] = useState<Course[]>(() => getAllCourses());
  const [selectedCourseId, setSelectedCourseId] = useState<string>(() => {
    const match = getAllCourses().find(
      (c) => c.name === courseName && c.slope === slope && c.courseRating === courseRating,
    );
    return match?.id ?? '';
  });
  const [showAddCourse, setShowAddCourse] = useState(false);
  const [draft, setDraft] = useState<Course>(() => ({
    id: '',
    name: '',
    slope: 113,
    courseRating: 72,
    holes: blankHoles(),
  }));

  const canProceedFromPlayers = players.length >= 4 && players.every((p) => p.name.trim());

  const totalPar = holes.reduce((sum, h) => sum + h.par, 0);
  const computeHandicap = (index: number, s = slope, r = courseRating, p = totalPar) =>
    Math.round(index * (s / 113) + (r - p));

  // Apply a saved course to the round: name, slope, rating, and per-hole pars,
  // then recompute every player's course handicap against the new numbers.
  const applyCourse = (course: Course) => {
    onSetCourseName(course.name);
    onSetSlope(course.slope);
    onSetCourseRating(course.courseRating);
    onSetHoles(course.holes.map((h) => ({ ...h })));
    const coursePar = course.holes.reduce((sum, h) => sum + h.par, 0);
    players.forEach((p) => {
      onUpdatePlayer(
        p.id,
        'handicap',
        computeHandicap(p.handicapIndex || 0, course.slope, course.courseRating, coursePar),
      );
    });
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
    const newCourse: Course = {
      ...draft,
      name,
      id: `course-${Date.now()}`,
    };
    setCourses(getAllCourses().concat(newCourse));
    saveCustomCourse(newCourse);
    setCourses(getAllCourses());
    setSelectedCourseId(newCourse.id);
    applyCourse(newCourse);
    setShowAddCourse(false);
  };

  const handleDeleteCourse = () => {
    if (selectedCourseId === GENEVA_COURSE.id || !selectedCourseId) return;
    const ok = window.confirm('Delete this course? This cannot be undone.');
    if (!ok) return;
    deleteCustomCourse(selectedCourseId);
    setCourses(getAllCourses());
    setSelectedCourseId(GENEVA_COURSE.id);
    applyCourse(GENEVA_COURSE);
  };

  const handleAddMatch = () => {
    if (newMatchTeam1[0] && newMatchTeam1[1] && newMatchTeam2[0] && newMatchTeam2[1]) {
      onAddMatch(newMatchTeam1, newMatchTeam2, newMatchRotation);
      setNewMatchTeam1(['', '']);
      setNewMatchTeam2(['', '']);
    }
  };

  return (
    <div className="min-h-screen bg-black p-4 pb-24">
      <div className="mb-6 flex flex-col items-center">
        <div className="relative bg-red-600 rounded-2xl px-6 py-4 border-4 border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-white rounded-full w-6 h-6 flex items-center justify-center">
            <span className="text-red-700 text-xs font-black">★</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎲</span>
            <div className="text-center">
              <div className="text-yellow-300 text-[10px] font-bold tracking-widest uppercase">Welcome to</div>
              <div className="text-white text-2xl font-black tracking-wide" style={{ textShadow: '2px 2px 4px rgba(0,0,0,0.5)' }}>
                VEGAS GOLF
              </div>
              <div className="text-yellow-300 text-[10px] font-bold tracking-widest uppercase">Tracker</div>
            </div>
            <span className="text-2xl">🎲</span>
          </div>
          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
            ))}
          </div>
        </div>
      </div>

      {/* Step tabs */}
      <div className="flex gap-1 mb-6 bg-neutral-900 rounded-lg p-1">
        {(['players', 'course', 'matches'] as SetupStep[]).map((s) => (
          <button
            key={s}
            onClick={() => setStep(s)}
            className={`flex-1 py-2 px-3 rounded-md text-sm font-medium capitalize transition-colors ${
              step === s
                ? 'bg-red-600 text-white'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Players Step */}
      {step === 'players' && (
        <div className="space-y-4">
          <button
            onClick={handleNewGame}
            className="w-full bg-neutral-800 border border-neutral-700 text-neutral-200 py-2.5 rounded-lg font-semibold text-sm flex items-center justify-center gap-2"
          >
            <span>🔄</span> Start New Game
          </button>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-semibold text-neutral-200">Players</h2>
            {players.length < 5 && (
              <button
                onClick={onAddPlayer}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg"
              >
                + Add 5th Player
              </button>
            )}
          </div>

          {players.map((player, idx) => (
            <div key={player.id} className="bg-neutral-900 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-red-500 font-bold text-lg">#{idx + 1}</span>
                {players.length > 4 && (
                  <button
                    onClick={() => onRemovePlayer(player.id)}
                    className="ml-auto text-red-400 text-sm"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="text-xs text-neutral-400 mb-1 block">Name</label>
                  <input
                    type="text"
                    value={player.name}
                    onChange={(e) => onUpdatePlayer(player.id, 'name', e.target.value)}
                    placeholder="Player name"
                    className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Index</label>
                  <PlayerIndexInput
                    value={player.handicapIndex || 0}
                    onChange={(idx) => {
                      onUpdatePlayer(player.id, 'handicapIndex', idx);
                      onUpdatePlayer(player.id, 'handicap', computeHandicap(idx));
                    }}
                    className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-400 mb-1 block">Handicap</label>
                  <input
                    type="text"
                    value={formatHandicap(computeHandicap(player.handicapIndex || 0))}
                    readOnly
                    tabIndex={-1}
                    className="w-full bg-neutral-800/50 text-neutral-300 rounded-lg px-3 py-2 text-sm border border-neutral-700 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>
          ))}

          <div className="mt-4">
            <label className="text-xs text-neutral-400 mb-1 block">Point Value ($)</label>
            <input
              type="number"
              value={pointValue}
              onChange={(e) => onSetPointValue(parseFloat(e.target.value) || 0.5)}
              step="0.25"
              min="0"
              className="w-32 bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
            />
          </div>

          <div className="mt-4 bg-neutral-900 rounded-xl p-3">
            <div className="text-xs text-neutral-400 mb-2">Course Rating (par {totalPar})</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Slope</label>
                <input
                  type="number"
                  value={slope}
                  onChange={(e) => {
                    const newSlope = parseInt(e.target.value) || 113;
                    onSetSlope(newSlope);
                    setSelectedCourseId('');
                    players.forEach((p) => {
                      onUpdatePlayer(
                        p.id,
                        'handicap',
                        computeHandicap(p.handicapIndex || 0, newSlope, courseRating, totalPar),
                      );
                    });
                  }}
                  min="55"
                  max="155"
                  className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="text-xs text-neutral-500 mb-1 block">Rating</label>
                <input
                  type="number"
                  step="0.1"
                  value={courseRating}
                  onChange={(e) => {
                    const newRating = parseFloat(e.target.value) || 72;
                    onSetCourseRating(newRating);
                    setSelectedCourseId('');
                    players.forEach((p) => {
                      onUpdatePlayer(
                        p.id,
                        'handicap',
                        computeHandicap(p.handicapIndex || 0, slope, newRating, totalPar),
                      );
                    });
                  }}
                  className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div className="mt-4">
            <label className="text-xs text-neutral-400 mb-2 block">Handicap Mode</label>
            <div className="flex gap-1 bg-neutral-800 rounded-lg p-1">
              <button
                onClick={() => onSetHandicapMode('off-the-low')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  handicapMode === 'off-the-low'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Off the Low
              </button>
              <button
                onClick={() => onSetHandicapMode('full')}
                className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors ${
                  handicapMode === 'full'
                    ? 'bg-red-600 text-white'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Full Handicap
              </button>
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              {handicapMode === 'off-the-low'
                ? 'Strokes calculated relative to the lowest handicap'
                : 'Each player receives their full handicap strokes'}
            </p>
          </div>

          <button
            onClick={() => setStep('course')}
            disabled={!canProceedFromPlayers}
            className="w-full mt-4 bg-red-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-3 rounded-xl font-semibold text-lg"
          >
            Next: Course Setup
          </button>
        </div>
      )}

      {/* Course Step */}
      {step === 'course' && (
        <div className="space-y-4">
          {/* Course picker */}
          <div className="bg-neutral-900 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-200">Course</h2>
              <button
                onClick={startAddCourse}
                className="text-sm bg-red-600 text-white px-3 py-1.5 rounded-lg"
              >
                + Add Course
              </button>
            </div>
            <select
              value={selectedCourseId}
              onChange={(e) => handleSelectCourse(e.target.value)}
              className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
            >
              {selectedCourseId === '' && <option value="">Custom (unsaved)</option>}
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} — Slope {c.slope} / Rating {c.courseRating}
                </option>
              ))}
            </select>
            {selectedCourseId && selectedCourseId !== GENEVA_COURSE.id && (
              <button
                onClick={handleDeleteCourse}
                className="text-xs text-red-400"
              >
                Delete this course
              </button>
            )}
            <p className="text-xs text-neutral-500">
              Picking a course fills in its slope, rating and pars below. Geneva Golf Club is the
              default and can't be removed.
            </p>
          </div>

          {/* Add-course form */}
          {showAddCourse && (
            <div className="bg-neutral-900 rounded-xl p-4 space-y-3 border border-red-600/40">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-red-400">New Course</h3>
                <button
                  onClick={() => setShowAddCourse(false)}
                  className="text-xs text-neutral-400"
                >
                  Cancel
                </button>
              </div>
              <div>
                <label className="text-xs text-neutral-400 mb-1 block">Course Name</label>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => setDraft((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Pebble Beach"
                  className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Slope</label>
                  <input
                    type="number"
                    value={draft.slope}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, slope: parseInt(e.target.value) || 113 }))
                    }
                    min="55"
                    max="155"
                    className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-xs text-neutral-500 mb-1 block">Rating</label>
                  <input
                    type="number"
                    step="0.1"
                    value={draft.courseRating}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, courseRating: parseFloat(e.target.value) || 72 }))
                    }
                    className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="text-xs text-neutral-400">Par & handicap by hole (par {draftPar})</div>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {draft.holes.map((hole) => (
                  <div key={hole.number} className="bg-neutral-800 rounded-lg p-2 flex items-center gap-3">
                    <span className="text-red-500 font-bold w-8 text-center">#{hole.number}</span>
                    <div className="flex-1">
                      <label className="text-xs text-neutral-500">Par</label>
                      <select
                        value={hole.par}
                        onChange={(e) => updateDraftHole(hole.number, 'par', parseInt(e.target.value))}
                        className="w-full bg-neutral-900 text-white rounded px-2 py-1 text-sm border border-neutral-700"
                      >
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-neutral-500">Hdcp</label>
                      <input
                        type="number"
                        value={hole.handicapRating}
                        onChange={(e) =>
                          updateDraftHole(hole.number, 'handicapRating', parseInt(e.target.value) || 1)
                        }
                        min={1}
                        max={18}
                        className="w-full bg-neutral-900 text-white rounded px-2 py-1 text-sm border border-neutral-700 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleSaveCourse}
                disabled={!draft.name.trim()}
                className="w-full bg-red-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-2.5 rounded-lg font-semibold text-sm"
              >
                Save Course
              </button>
            </div>
          )}

          <div>
            <label className="text-xs text-neutral-400 mb-1 block">Course Name (optional)</label>
            <input
              type="text"
              value={courseName}
              onChange={(e) => {
                onSetCourseName(e.target.value);
                setSelectedCourseId('');
              }}
              placeholder="Course name"
              className="w-full bg-neutral-800 text-white rounded-lg px-3 py-2 text-sm border border-neutral-700 focus:border-red-500 focus:outline-none"
            />
          </div>

          <h2 className="text-lg font-semibold text-neutral-200">Hole Setup</h2>
          <p className="text-xs text-neutral-400">Set par and handicap rating (difficulty 1=hardest) for each hole.</p>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {holes.map((hole) => (
              <div key={hole.number} className="bg-neutral-900 rounded-lg p-3 flex items-center gap-3">
                <span className="text-red-500 font-bold w-8 text-center">#{hole.number}</span>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500">Par</label>
                  <select
                    value={hole.par}
                    onChange={(e) => {
                      onUpdateHole(hole.number, 'par', parseInt(e.target.value));
                      setSelectedCourseId('');
                    }}
                    className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-sm border border-neutral-700"
                  >
                    <option value={3}>3</option>
                    <option value={4}>4</option>
                    <option value={5}>5</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="text-xs text-neutral-500">Hdcp</label>
                  <input
                    type="number"
                    value={hole.handicapRating}
                    onChange={(e) => {
                      onUpdateHole(hole.number, 'handicapRating', parseInt(e.target.value) || 1);
                      setSelectedCourseId('');
                    }}
                    min={1}
                    max={18}
                    className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-sm border border-neutral-700 focus:outline-none"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => {
              if (matches.length === 0) onAutoGenerateMatches();
              setStep('matches');
            }}
            className="w-full mt-4 bg-red-600 text-white py-3 rounded-xl font-semibold text-lg"
          >
            Next: Match Setup
          </button>
        </div>
      )}

      {/* Matches Step */}
      {step === 'matches' && (
        <div className="space-y-4">
          <div className="mb-2">
            <h2 className="text-lg font-semibold text-neutral-200 mb-2">Matches</h2>
            <button
              onClick={() => {
                onSetMatches([]);
                onAutoGenerateMatches();
              }}
              className="w-full text-sm bg-neutral-800 text-neutral-300 px-3 py-2 rounded-lg"
            >
              🎲 Randomize Teams (Auto-Generate)
            </button>
          </div>

          {[1, 2, 3].map((rotation) => {
            const rotationMatches = matches.filter((m) => m.rotation === rotation);
            return (
              <div key={rotation} className="bg-neutral-900 rounded-xl p-4">
                <h3 className="text-red-500 font-semibold mb-3">
                  Rotation {rotation} (Holes {(rotation - 1) * 6 + 1}-{rotation * 6})
                </h3>
                {rotationMatches.length === 0 && (
                  <p className="text-neutral-500 text-sm">No matches</p>
                )}
                {rotationMatches.map((match) => {
                  const t1 = match.team1.map((id) => players.find((p) => p.id === id)?.name || '?');
                  const t2 = match.team2.map((id) => players.find((p) => p.id === id)?.name || '?');
                  return (
                    <div key={match.id} className="flex items-center justify-between bg-neutral-800 rounded-lg p-3 mb-2">
                      <span className="text-sm text-white">
                        <span className="text-red-400">{t1.join(' & ')}</span>
                        <span className="text-neutral-400 mx-2">vs</span>
                        <span className="text-orange-300">{t2.join(' & ')}</span>
                      </span>
                      <button
                        onClick={() => onRemoveMatch(match.id)}
                        className="text-red-400 text-xs ml-2"
                      >
                        X
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* Add custom match */}
          <div className="bg-neutral-900 rounded-xl p-4">
            <h3 className="text-neutral-300 font-semibold mb-3 text-sm">Add Custom Match</h3>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-xs text-neutral-500">Rotation</label>
                <select
                  value={newMatchRotation}
                  onChange={(e) => setNewMatchRotation(parseInt(e.target.value))}
                  className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-sm border border-neutral-700"
                >
                  <option value={1}>1 (Holes 1-6)</option>
                  <option value={2}>2 (Holes 7-12)</option>
                  <option value={3}>3 (Holes 13-18)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-2">
              <div>
                <label className="text-xs text-red-500">Team 1</label>
                {[0, 1].map((i) => (
                  <select
                    key={i}
                    value={newMatchTeam1[i]}
                    onChange={(e) => {
                      const updated = [...newMatchTeam1] as [string, string];
                      updated[i] = e.target.value;
                      setNewMatchTeam1(updated);
                    }}
                    className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-sm border border-neutral-700 mb-1"
                  >
                    <option value="">Select player</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name || `Player ${players.indexOf(p) + 1}`}</option>
                    ))}
                  </select>
                ))}
              </div>
              <div>
                <label className="text-xs text-orange-400">Team 2</label>
                {[0, 1].map((i) => (
                  <select
                    key={i}
                    value={newMatchTeam2[i]}
                    onChange={(e) => {
                      const updated = [...newMatchTeam2] as [string, string];
                      updated[i] = e.target.value;
                      setNewMatchTeam2(updated);
                    }}
                    className="w-full bg-neutral-800 text-white rounded px-2 py-1 text-sm border border-neutral-700 mb-1"
                  >
                    <option value="">Select player</option>
                    {players.map((p) => (
                      <option key={p.id} value={p.id}>{p.name || `Player ${players.indexOf(p) + 1}`}</option>
                    ))}
                  </select>
                ))}
              </div>
            </div>
            <button
              onClick={handleAddMatch}
              className="w-full bg-neutral-700 text-white py-2 rounded-lg text-sm"
            >
              Add Match
            </button>
          </div>

          <button
            onClick={onStart}
            disabled={matches.length === 0}
            className="w-full mt-4 bg-red-600 disabled:bg-neutral-800 disabled:text-neutral-500 text-white py-3 rounded-xl font-semibold text-lg"
          >
            Start Round
          </button>
        </div>
      )}
    </div>
  );
}
