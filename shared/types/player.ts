// ── Club Position ─────────────────────────────────────────────────────────────

export interface ClubPosition {
  id: number;
  name: string;
  color: string;
}

export interface ClubPositionCreate {
  name: string;
  color?: string;
}

export interface ClubPositionUpdate {
  name?: string;
  color?: string;
}

export interface ClubPositionDetail {
  id: number;
  club_id: number;
  name: string;
  color: string;
  archived_at: string | null;
  created_at: string;
}

// ── Player ────────────────────────────────────────────────────────────────────

export interface Player {
  id: number;
  club_id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  positions: ClubPosition[];
  photo_url: string | null;
  phone: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface PlayerCreate {
  first_name: string;
  last_name: string;
  date_of_birth?: string | null;
  position_ids?: number[];
  photo_url?: string | null;
  phone?: string | null;
}

export interface PlayerUpdate {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  position_ids?: number[];
  photo_url?: string | null;
  phone?: string | null;
}

export interface PhotoUploadUrls {
  upload_url: string;
  photo_url: string;
}

// ── RosterEntry ───────────────────────────────────────────────────────────────

export type RosterPosition =
  | "point_guard"
  | "shooting_guard"
  | "small_forward"
  | "power_forward"
  | "center";

export const ROSTER_POSITION_LABELS: Record<RosterPosition, string> = {
  point_guard: "Base",
  shooting_guard: "Escolta",
  small_forward: "Alero",
  power_forward: "Ala-pívot",
  center: "Pívot",
};

export interface RosterEntry {
  id: number;
  player_id: number;
  team_id: number;
  season_id: number;
  jersey_number: number | null;
  position: RosterPosition | null;
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
  position?: RosterPosition | null;
}

export interface RosterEntryUpdate {
  jersey_number?: number | null;
  position?: RosterPosition | null;
  points_per_game?: number | null;
  rebounds_per_game?: number | null;
  assists_per_game?: number | null;
  minutes_per_game?: number | null;
}

// ── CSV Import ────────────────────────────────────────────────────────────────

export interface CsvImportError {
  row: number;
  message: string;
}

export interface CsvImportResult {
  created: number;
  skipped: number;
  errors: CsvImportError[];
}
