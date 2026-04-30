import { useEffect, useState } from 'react';
import { useRound } from './hooks/useRound';
import SetupScreen from './components/SetupScreen';
import HoleEntry from './components/HoleEntry';
import Scoreboard from './components/Scoreboard';
import RoundHistory from './components/RoundHistory';
import Scorecard from './components/Scorecard';
import TournamentApp from './tournament/TournamentApp';

function useHashRoute(): [string, (next: string) => void] {
  const [hash, setHash] = useState(() => window.location.hash || '#/');
  useEffect(() => {
    const on = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const navigate = (next: string) => {
    window.location.hash = next;
  };
  return [hash, navigate];
}

function HomeScreen({ onPickTournament }: { onPickTournament: () => void }) {
  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col items-center justify-center p-6">
      <div className="text-center mb-8">
        <img
          src={`${import.meta.env.BASE_URL}hero.jpg`}
          alt="Who's ready to gamble"
          className="w-48 h-48 rounded-full object-cover mx-auto mb-4 border-2 border-neutral-700"
        />
        <h1 className="text-2xl font-bold">Who's Ready to Gamble</h1>
      </div>

      <div className="w-full max-w-sm">
        <button
          onClick={onPickTournament}
          className="w-full p-5 bg-emerald-700 rounded-2xl text-left active:bg-emerald-800"
        >
          <div className="font-bold text-lg">Tournament</div>
          <div className="text-sm text-emerald-100/80">
            Multiple groups, live leaderboard, Vegas games, handicaps
          </div>
        </button>
      </div>

      <p className="text-[10px] text-neutral-600 mt-10 text-center max-w-xs">
        Live scoring syncs across devices in real time.
      </p>
    </div>
  );
}

function GameCodeBanner({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}${window.location.pathname}#/vegas/join/${code}`;

  const copy = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="bg-amber-900/80 text-amber-100 text-center py-2 px-4 text-sm flex items-center justify-center gap-3">
      <span>Game Code: <strong className="tracking-widest text-base">{code}</strong></span>
      <button
        onClick={copy}
        className="bg-amber-700 hover:bg-amber-600 px-2 py-0.5 rounded text-xs font-semibold"
      >
        {copied ? 'Copied!' : 'Copy Link'}
      </button>
    </div>
  );
}

function JoinGameScreen({ onJoin, onBack }: { onJoin: (code: string) => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col items-center justify-center p-6">
      <h2 className="text-2xl font-bold mb-6">Join a Vegas Game</h2>
      <p className="text-neutral-400 text-sm mb-4">Enter the 6-character game code</p>
      <input
        type="text"
        maxLength={6}
        value={code}
        onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(''); }}
        className="bg-neutral-800 text-center text-2xl tracking-[0.3em] font-mono rounded-xl px-6 py-4 w-48 mb-4 outline-none focus:ring-2 focus:ring-red-500"
        placeholder="ABC123"
        autoFocus
      />
      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}
      <div className="flex gap-3">
        <button onClick={onBack} className="px-5 py-2 bg-neutral-700 rounded-lg">Back</button>
        <button
          onClick={() => {
            if (code.length !== 6) { setError('Code must be 6 characters'); return; }
            onJoin(code);
          }}
          className="px-5 py-2 bg-red-600 rounded-lg font-semibold"
        >
          Join Game
        </button>
      </div>
    </div>
  );
}

type VegasScreen = 'history' | 'scoreboard' | 'scorecard' | 'holes' | 'setup';

function VegasApp({
  onExit,
  initialJoinCode,
  initialScreen,
}: {
  onExit: () => void;
  initialJoinCode?: string;
  initialScreen?: VegasScreen;
}) {
  const round = useRound();
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  // Auto-join if we navigated with a join code. Compare against the current
  // gameCode (which may have been restored from localStorage on first render);
  // otherwise a stale cached code makes /vegas/join/<NEW> silently keep the
  // old game instead of switching to <NEW>.
  const { gameCode: currentGameCode, joinGame, setScreen: roundSetScreen } = round;
  useEffect(() => {
    if (!initialJoinCode) return;
    if (initialJoinCode === currentGameCode) return;
    joinGame(initialJoinCode).then((ok) => {
      if (!ok) setJoinError(`Game "${initialJoinCode}" not found`);
    });
  }, [initialJoinCode, currentGameCode, joinGame]);

  // Apply initialScreen when navigating in via a screen-specific URL like
  // `#/vegas/history`. We only apply when the prop is set so users navigating
  // to bare `#/vegas` keep whatever screen state they were last on.
  useEffect(() => {
    if (initialScreen) roundSetScreen(initialScreen);
  }, [initialScreen, roundSetScreen]);

  if (joining) {
    return (
      <JoinGameScreen
        onBack={() => setJoining(false)}
        onJoin={async (code) => {
          const ok = await round.joinGame(code);
          if (ok) {
            setJoining(false);
          } else {
            setJoinError(`Game "${code}" not found`);
          }
        }}
      />
    );
  }

  if (round.screen === 'history') {
    return (
      <RoundHistory
        onBack={onExit}
        onEditRound={(saved) => {
          round.loadSavedRound(saved);
          // Drop the `/history` segment so a refresh on the scoreboard doesn't
          // bounce the user back to the history list via the initialScreen
          // useEffect above.
          if (window.location.hash === '#/vegas/history') {
            window.location.hash = '#/vegas';
          }
        }}
      />
    );
  }

  if (round.screen === 'scorecard') {
    return (
      <Scorecard
        players={round.players}
        holes={round.holes}
        scores={round.scores}
        courseName={round.courseName}
        onBack={() => round.setScreen('holes')}
      />
    );
  }

  if (round.screen === 'scoreboard') {
    return (
      <>
        {round.gameCode && <GameCodeBanner code={round.gameCode} />}
        <Scoreboard
          players={round.players}
          matches={round.matches}
          holes={round.holes}
          scores={round.scores}
          courseName={round.courseName}
          pointValue={round.pointValue}
          getMatchTotal={round.getMatchTotal}
          getPlayerMoney={round.getPlayerMoney}
          getMatchResultsForHole={round.getMatchResultsForHole}
          getMultiplier={round.getMultiplier}
          getMultiplierValue={round.getMultiplierValue}
          onBack={() => round.setScreen('holes')}
          onFinish={() => {
            // Save the round to localStorage history, then exit Vegas back to
            // the tournaments list so the user can start (or open) another
            // event. Going to 'history' here would strand them on a dead-end
            // screen now that standalone Vegas has been removed.
            round.finishRound();
            onExit();
          }}
        />
      </>
    );
  }

  if (round.screen === 'holes') {
    return (
      <>
        {round.gameCode && <GameCodeBanner code={round.gameCode} />}
        <HoleEntry
          players={round.players}
          holes={round.holes}
          matches={round.matches}
          scores={round.scores}
          currentHole={round.currentHole}
          onSetCurrentHole={round.setCurrentHole}
          onSetScore={round.setScore}
          onClearScore={round.clearScore}
          onShowScoreboard={() => round.setScreen('scoreboard')}
          onShowScorecard={() => round.setScreen('scorecard')}
          getMatchResultsForHole={round.getMatchResultsForHole}
          getActiveMatches={round.getActiveMatches}
          getCurrentRotation={round.getCurrentRotation}
          getMultiplier={round.getMultiplier}
          getMultiplierValue={round.getMultiplierValue}
          onSetMultiplier={round.setMatchMultiplier}
          onUpdatePlayer={round.updatePlayer}
          handicapMode={round.handicapMode}
          onSetHandicapMode={round.setHandicapMode}
          slope={round.slope}
          courseRating={round.courseRating}
          onRecalculateStrokes={round.recalculateStrokes}
          onAutoGenerateMatches={round.autoGenerateMatches}
          onAddMatch={round.addMatch}
          onRemoveMatch={round.removeMatch}
          onSetMatches={round.setMatches}
        />
      </>
    );
  }

  return (
    <div className="relative">
      {joinError && (
        <div className="bg-red-900/80 text-red-100 text-center py-2 px-4 text-sm">
          {joinError}
          <button onClick={() => setJoinError('')} className="ml-3 underline">Dismiss</button>
        </div>
      )}
      <SetupScreen
        players={round.players}
        holes={round.holes}
        matches={round.matches}
        courseName={round.courseName}
        pointValue={round.pointValue}
        onUpdatePlayer={round.updatePlayer}
        onAddPlayer={round.addPlayer}
        onRemovePlayer={round.removePlayer}
        onUpdateHole={round.updateHole}
        onAutoGenerateMatches={round.autoGenerateMatches}
        onAddMatch={round.addMatch}
        onRemoveMatch={round.removeMatch}
        onSetMatches={round.setMatches}
        onSetCourseName={round.setCourseName}
        onSetPointValue={round.setPointValue}
        slope={round.slope}
        onSetSlope={round.setSlope}
        courseRating={round.courseRating}
        onSetCourseRating={round.setCourseRating}
        handicapMode={round.handicapMode}
        onSetHandicapMode={round.setHandicapMode}
        onStart={round.startRound}
        onNewGame={round.resetForNewGame}
      />
      <div className="fixed bottom-4 right-4 flex gap-2">
        <button
          onClick={() => setJoining(true)}
          className="bg-amber-700 text-amber-100 px-4 py-2 rounded-lg text-sm font-semibold"
        >
          Join Game
        </button>
        <button
          onClick={onExit}
          className="bg-neutral-800 text-neutral-300 px-4 py-2 rounded-lg text-sm"
        >
          Exit
        </button>
        <button
          onClick={() => round.setScreen('history')}
          className="bg-neutral-800 text-neutral-300 px-4 py-2 rounded-lg text-sm"
        >
          History
        </button>
      </div>
    </div>
  );
}

function ModeToggle({ current, onSwitch, onLeaderboard }: { current: 'vegas' | 'tournament'; onSwitch: () => void; onLeaderboard?: () => void }) {
  const label = current === 'vegas' ? '🏆 Tournament' : '🎲 Vegas';
  const bg = current === 'vegas' ? 'bg-emerald-700 active:bg-emerald-800' : 'bg-red-700 active:bg-red-800';
  return (
    <div className="fixed top-3 right-3 z-50 flex gap-1.5">
      {onLeaderboard && (
        <button
          onClick={onLeaderboard}
          className="bg-amber-600 active:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg"
        >
          📊 Leaderboard
        </button>
      )}
      <button
        onClick={onSwitch}
        className={`${bg} text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg`}
      >
        {label}
      </button>
    </div>
  );
}

export default function App() {
  const [hash, navigate] = useHashRoute();
  const [lastTournamentRoute, setLastTournamentRoute] = useState('#/t');

  // Track the last tournament route so we can return to it
  useEffect(() => {
    if (hash.startsWith('#/t')) {
      setLastTournamentRoute(hash);
    }
  }, [hash]);

  // Extract tournament ID from last tournament route for leaderboard link
  const lastTournamentId = lastTournamentRoute.match(/^#\/t\/([^/]+)/)?.[1] || null;

  if (hash.startsWith('#/vegas')) {
    // Extract join code from #/vegas/join/{CODE}
    const joinMatch = hash.match(/^#\/vegas\/join\/([A-Za-z0-9]{6})$/);
    const joinCode = joinMatch ? joinMatch[1].toUpperCase() : undefined;
    const wantsHistory = hash === '#/vegas/history';

    return (
      <>
        <ModeToggle
          current="vegas"
          onSwitch={() => navigate(lastTournamentRoute)}
          onLeaderboard={lastTournamentId ? () => navigate(`#/t/${lastTournamentId}/leaderboard`) : undefined}
        />
        <VegasApp
          onExit={() => navigate('#/t')}
          initialJoinCode={joinCode}
          initialScreen={wantsHistory ? 'history' : undefined}
        />
      </>
    );
  }

  if (hash.startsWith('#/t')) {
    // No ModeToggle in tournament mode — Vegas is reachable only by launching
    // it from a group inside a tournament, not as a standalone mode.
    return (
      <TournamentApp
        route={hash}
        onNavigate={navigate}
        onExit={() => navigate('#/')}
      />
    );
  }

  return <HomeScreen onPickTournament={() => navigate('#/t')} />;
}
