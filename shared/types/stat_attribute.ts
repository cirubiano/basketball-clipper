// ── Stat Attributes — estadísticas personalizadas por equipo ──────────────────

export type StatAttributeType = "count";

export interface TeamStatAttribute {
  id: number;
  team_id: number;
  name: string;
  type: StatAttributeType;
  archived_at: string | null;
  created_at: string;
}

export interface CustomMatchStat {
  id: number;
  match_id: number;
  player_id: number;
  stat_attribute_id: number;
  value: number;
  created_at: string;
}

export interface StatAttributeCreate {
  name: string;
  type?: StatAttributeType;
}

export interface CustomMatchStatUpsert {
  player_id: number;
  stat_attribute_id: number;
  value: number;
}

export interface AddStaffRequest {
  user_id: number;
  season_id: number;
}
