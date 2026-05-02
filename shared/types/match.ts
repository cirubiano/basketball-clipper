export type MatchLocation = "home" | "away" | "neutral";
export type MatchStatus = "scheduled" | "in_progress" | "finished" | "cancelled";
export type MatchVideoLabel = "scouting" | "post_analysis" | "other";

export const MATCH_LOCATION_LABELS: Record<MatchLocation, string> = {
  home: "Casa",
  away: "Fuera",
  neutral: "Neutral",
};

export const MATCH_STATUS_LABELS: Record<MatchStatus, string> = {
  scheduled: "Programado",
  in_progress: "En curso",
  finished: "Finalizado",
  cancelled: "Cancelado",
};

export const MATCH_VIDEO_LABEL_LABELS: Record<MatchVideoLabel, string> = {
  scouting: "Scouting",
  post_analysis: "Análisis post-partido",
  other: "Otro",
};

export interface MatchVideo {
  id: number;
  match_id: number;
  video_id: number;
  label: MatchVideoLabel;
  video_title: string | null;
  video_s3_key: string | null;
}

export interface MatchPlayer {
  id: number;
  match_id: number;
  player_id: number;
  player_first_name: string | null;
  player_last_name: string | null;
}

export interface MatchStat {
  id: number;
  match_id: number;
  player_id: number;
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

export interface Match {
  id: number;
  team_id: number;
  season_id: number;
  date: string;
  opponent_name: string;
  location: MatchLocation;
  status: MatchStatus;
  notes: string | null;
  our_score: number | null;
  their_score: number | null;
  created_by: number | null;
  created_at: string;
  archived_at: string | null;
  match_videos: MatchVideo[];
  match_players: MatchPlayer[];
  match_stats: MatchStat[];
}

export interface MatchCreate {
  opponent_name: string;
  date: string;
  location: MatchLocation;
  season_id: number;
  status?: MatchStatus;
  notes?: string | null;
}

export interface MatchUpdate {
  opponent_name?: string;
  date?: string;
  location?: MatchLocation;
  notes?: string | null;
  our_score?: number | null;
  their_score?: number | null;
  // status is intentionally excluded — use startMatch, finishMatch, cancelMatch
}

export interface MatchVideoAdd {
  video_id: number;
  label?: MatchVideoLabel;
}

export interface MatchStatUpsert {
  player_id: number;
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
