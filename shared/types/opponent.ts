export interface OpponentPlayer {
  id: number;
  opponent_team_id: number;
  name: string;
  jersey_number: number | null;
  position: string | null;
  archived_at: string | null;
}

export interface OpponentPlayerCreate {
  jersey_number: number;
  name?: string | null;
  position?: string | null;
}

export interface OpponentPlayerBulkCreate {
  jersey_numbers: number[];
}

export interface OpponentPlayerUpdate {
  name?: string;
  jersey_number?: number | null;
  position?: string | null;
}

export interface OpponentTeam {
  id: number;
  club_id: number;
  name: string;
  notes: string | null;
  color: string;
  created_by: number | null;
  created_at: string;
  archived_at: string | null;
  players: OpponentPlayer[];
}

export interface OpponentTeamSummary {
  id: number;
  name: string;
  color: string;
  archived_at: string | null;
}

export interface OpponentTeamCreate {
  name: string;
  notes?: string | null;
  color?: string;
}

export interface OpponentTeamUpdate {
  name?: string;
  notes?: string | null;
  color?: string;
}

export interface OpponentMatchStat {
  id: number;
  match_id: number;
  opponent_player_id: number;
  opponent_player: OpponentPlayer;
  is_starter: boolean;
  points: number | null;
  minutes: number | null;
  assists: number | null;
  defensive_rebounds: number | null;
  offensive_rebounds: number | null;
  steals: number | null;
  turnovers: number | null;
  fouls: number | null;
  blocks: number | null;
}

export interface OpponentMatchStatUpsert {
  opponent_player_id: number;
  points?: number | null;
  minutes?: number | null;
  assists?: number | null;
  defensive_rebounds?: number | null;
  offensive_rebounds?: number | null;
  steals?: number | null;
  turnovers?: number | null;
  fouls?: number | null;
  blocks?: number | null;
}
