// ── Enums ─────────────────────────────────────────────────────────────────────

export type PlayerPosition =
  | "point_guard"
  | "shooting_guard"
  | "small_forward"
  | "power_forward"
  | "center";

export const POSITION_LABELS: Record<PlayerPosition, string> = {
  point_guard: "Base",
  shooting_guard: "Escolta",
  small_forward: "Alero",
  power_forward: "Ala-pívot",
  center: "Pívot",
};

// ── Player ────────────────────────────────────────────────────────────────────

export interface Player {
  id: number;
  club_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  position: PlayerPosition | null;
  photo_url: string | null;
  phone: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface PlayerCreate {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  position?: PlayerPosition | null;
  photo_url?: string | null;
  phone?: string | null;
}

export interface PlayerUpdate {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  position?: PlayerPosition | null;
  photo_url?: string | null;
  phone?: string | null;
}

// ── RosterEntry ───────────────────────────────────────────────────────────────

export interface RosterEntry {
  id: number;
  player_id: number;
  team_id: number;
  season_id: number;
  jersey_number: number | null;
  position: PlayerPosition | null;
  points_per_game: number | null;
  rebounds_per_game: number | null;
  assists_per_game: number | null;
  minutes_per_game: number | null;
  archived_at: string | null;
  created_at: string;
  player: Player;
}

export interface RosterEntryCreate {
  player_id: number;
  jersey_number?: number | null;
  position?: PlayerPosition | null;
}

export interface RosterEntryUpdate {
  jersey_number?: number | null;
  position?: PlayerPosition | null;
  points_per_game?: number | null;
  rebounds_per_game?: number | null;
  assists_per_game?: number | null;
  minutes_per_game?: number | null;
}
