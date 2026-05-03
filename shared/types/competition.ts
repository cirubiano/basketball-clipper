export type ClockType = "stopped" | "running";

export interface Competition {
  id: number;
  team_id: number;
  season_id: number;
  name: string;
  is_default: boolean;
  quarters: number;
  minutes_per_quarter: number;
  players_on_court: number;
  bench_size: number;
  clock_type: ClockType;
  created_by: number | null;
  created_at: string;
  archived_at: string | null;
  match_count: number;
}

export interface CompetitionCreate {
  season_id: number;
  name: string;
  is_default?: boolean;
  quarters?: number;
  minutes_per_quarter?: number;
  players_on_court?: number;
  bench_size?: number;
  clock_type?: ClockType;
}

export interface CompetitionUpdate {
  name?: string;
  is_default?: boolean;
  quarters?: number;
  minutes_per_quarter?: number;
  players_on_court?: number;
  bench_size?: number;
  clock_type?: ClockType;
}
