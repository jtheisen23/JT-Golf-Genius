export interface Player {
  id: string;
  name: string;
  handicapIndex: number;
  handicap: number;
  strokesReceived: number;
}

export interface Match {
  id: string;
  team1: [string, string];
  team2: [string, string];
  rotation: number;
}

export interface HoleResult {
  holeNumber: number;
  team1Vegas: number;
  team2Vegas: number;
  points: number; // positive = team1 wins
}

export interface HoleSetup {
  number: number;
  par: number;
  handicapRating: number;
}

export interface Course {
  id: string;
  name: string;
  slope: number;
  courseRating: number;
  holes: HoleSetup[];
}

export interface Round {
  id: string;
  date: string;
  courseName: string;
  players: Player[];
  holes: HoleSetup[];
  matches: Match[];
  scores: Record<string, Record<number, number>>; // playerId -> holeNumber -> gross score
  pointsPerDollar: number;
  slope?: number;
  courseRating?: number;
}

export interface SavedRound extends Round {
  results: MatchResult[];
  multipliers?: Record<string, Record<number, Multiplier>>;
}

export interface MatchResult {
  matchId: string;
  team1Names: string;
  team2Names: string;
  totalPoints: number;
  money: number;
}

export type Screen = 'setup' | 'holes' | 'scoreboard' | 'history' | 'scorecard';

export type Multiplier = 'none' | 'press' | 'roll' | 're-roll';

export type HandicapMode = 'off-the-low' | 'full';
