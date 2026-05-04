// ── Stat Attributes — estadísticas personalizadas por equipo ──────────────────

export type StatAttributeType = "count";

export interface TeamStatAttribute {
  id: number;
  team_id: number;
  name: string;
  /** Abreviatura para botones compactos (máx. 10 caracteres). */
  short_name: string | null;
  /** Descripción opcional del significado de la estadística. */
  description: string | null;
  /** Clave de color para el botón en la pantalla de partido en vivo. */
  color: string | null;
  type: StatAttributeType;
  archived_at: string | null;
  created_at: string;
}

export interface CustomMatchStat {
  id: number;
  match_id: number;
  stat_attribute_id: number;
  /** Jugador del equipo local. Exactamente uno de player_id / opponent_player_id es no-null. */
  player_id: number | null;
  /** Jugador rival. Exactamente uno de player_id / opponent_player_id es no-null. */
  opponent_player_id: number | null;
  value: number;
  created_at: string;
}

export interface StatAttributeCreate {
  name: string;
  short_name?: string | null;
  description?: string | null;
  color?: string | null;
  type?: StatAttributeType;
}

export interface StatAttributeUpdate {
  name: string;
  short_name?: string | null;
  description?: string | null;
  color?: string | null;
}

export interface CustomMatchStatUpsert {
  stat_attribute_id: number;
  player_id?: number | null;
  opponent_player_id?: number | null;
  value: number;
}

export interface AddStaffRequest {
  user_id: number;
  season_id: number;
}
