export interface TourPlayer {
  id: string;
  name: string;
  ghinNumber?: string;
  handicapIndex: number; // e.g. 12.4
  courseHandicap: number; // whole strokes
  teeTime?: string;
}

export interface TourHole {
  number: number;
  par: number;
  handicapRating: number; // stroke index 1-18
  yards?: number;
}

export interface TourGroup {
  id: string;
  name: string; // e.g. "Group 1" or "Tee Time 9:00"
  playerIds: string[];
  teeTime?: string;
  vegasGameCode?: string; // game code if a Vegas game was launched for this group
}

export type TournamentFormat = 'stroke' | 'stableford' | 'both';

export type PlayDay = 'friday' | 'sunday';

export interface Tournament {
  id: string;
  name: string;
  courseName: string;
  slope?: number; // course slope rating (default 132)
  courseRating?: number; // course rating (default 70)
  date: string; // ISO date (YYYY-MM-DD)
  playDay?: PlayDay; // optional weekly tag: friday/sunday play
  holes: TourHole[];
  players: Record<string, TourPlayer>;
  groups: TourGroup[];
  // groupId -> playerId -> holeNumber -> gross score
  scores: Record<string, Record<string, Record<number, number>>>;
  format: TournamentFormat;
  handicapAllowance: number; // 100 = full, 85 = 85%, etc.
  startTime?: string; // first tee time, "HH:MM" (24h), e.g. "08:00"
  teeTimeInterval?: number; // minutes between tee times (default 12)
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  playerId: string;
  playerName: string;
  groupName: string;
  thru: number; // holes completed
  grossTotal: number; // sum of gross on played holes
  grossToPar: number;
  netTotal: number;
  netToPar: number;
  stableford: number;
  position: number;
}
