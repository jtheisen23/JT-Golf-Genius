import { useTournament } from './useTournament';
import EventsList from './components/EventsList';
import EventHome from './components/EventHome';
import TournamentSetup from './components/TournamentSetup';
import GroupScoring from './components/GroupScoring';
import Leaderboard from './components/Leaderboard';
import Registration from './components/Registration';
import PastResults from './components/PastResults';
import { sync } from './sync';

interface Props {
  route: string;
  onNavigate: (hash: string) => void;
  onExit: () => void;
}

/**
 * Routes handled here (hash-based so URLs are shareable):
 *   #/t                             → tournaments list
 *   #/t/:id                         → event home (groups list, leaderboard link)
 *   #/t/:id/setup                   → edit event (players, groups, holes, details)
 *   #/t/:id/group/:groupId          → live scoring for a group
 *   #/t/:id/leaderboard             → live leaderboard
 */
export default function TournamentApp({ route, onNavigate, onExit }: Props) {
  const parts = route.replace(/^#?\/?t\/?/, '').split('/').filter(Boolean);
  const eventId = parts[0] || null;
  const section = parts[1] || null;
  const sectionArg = parts[2] || null;

  const { tournament, setScore, addPlayer, updatePlayer, removePlayer,
    addGroup, updateGroup, removeGroup, setGroups, updateHole, updateMeta } = useTournament(eventId);

  // Derived: if we have an event id but no saved data exists, we need a
  // "not found" state. Reading sync directly avoids effect-driven state.
  const needsCreate = !!eventId && !tournament && sync.load(eventId) == null;

  if (parts[0] === 'results') {
    return (
      <PastResults
        onBack={() => onNavigate('#/t')}
        onOpenLeaderboard={(id) => onNavigate(`#/t/${id}/leaderboard`)}
      />
    );
  }

  if (!eventId) {
    return (
      <EventsList
        onOpenEvent={(id) => onNavigate(`#/t/${id}`)}
        onOpenRegistration={(id) => onNavigate(`#/t/${id}/register`)}
        onOpenLeaderboard={(id) => onNavigate(`#/t/${id}/leaderboard`)}
        onOpenResults={() => onNavigate('#/t/results')}
        onExit={onExit}
      />
    );
  }

  if (needsCreate && !tournament) {
    return (
      <div className="min-h-screen bg-black text-neutral-100 p-6 flex flex-col items-center justify-center">
        <p className="text-neutral-400 mb-4">Tournament not found on this device.</p>
        <p className="text-neutral-500 text-sm mb-6 text-center max-w-sm">
          Tournament data is stored locally. If someone shared a link with you, they
          need to share the data from the same device/origin (real-time sync across
          devices requires a backend — see <code>src/tournament/sync.ts</code>).
        </p>
        <button
          onClick={() => onNavigate('#/t')}
          className="px-4 py-2 bg-emerald-600 rounded-lg text-white font-semibold"
        >
          See my tournaments
        </button>
      </div>
    );
  }

  if (!tournament) return null;

  if (section === 'setup') {
    return (
      <TournamentSetup
        tournament={tournament}
        onAddPlayer={addPlayer}
        onUpdatePlayer={updatePlayer}
        onRemovePlayer={removePlayer}
        onAddGroup={addGroup}
        onUpdateGroup={updateGroup}
        onRemoveGroup={removeGroup}
        onSetGroups={setGroups}
        onUpdateHole={updateHole}
        onUpdateMeta={updateMeta}
        onStart={() => onNavigate(`#/t/${tournament.id}`)}
      />
    );
  }

  if (section === 'register') {
    return (
      <Registration
        tournament={tournament}
        onAddPlayer={addPlayer}
        onRemovePlayer={removePlayer}
        onBack={() => onNavigate(`#/t/${tournament.id}`)}
      />
    );
  }

  if (section === 'leaderboard') {
    return (
      <Leaderboard
        tournament={tournament}
        onBack={() => onNavigate(`#/t/${tournament.id}`)}
      />
    );
  }

  if (section === 'group' && sectionArg) {
    return (
      <GroupScoring
        tournament={tournament}
        groupId={sectionArg}
        onSetScore={setScore}
        onOpenLeaderboard={() => onNavigate(`#/t/${tournament.id}/leaderboard`)}
        onBack={() => onNavigate(`#/t/${tournament.id}`)}
      />
    );
  }

  return (
    <EventHome
      tournament={tournament}
      onOpenGroup={(gid) => onNavigate(`#/t/${tournament.id}/group/${gid}`)}
      onOpenLeaderboard={() => onNavigate(`#/t/${tournament.id}/leaderboard`)}
      onOpenRegistration={() => onNavigate(`#/t/${tournament.id}/register`)}
      onSetGroups={setGroups}
      onEditSetup={() => onNavigate(`#/t/${tournament.id}/setup`)}
      onExit={() => onNavigate('#/t')}
    />
  );
}
