// ── Enums ─────────────────────────────────────────────────────────────────────

export type DrillType = "drill" | "play";

export type CourtLayoutType =
  | "full_fiba"
  | "half_fiba"
  | "mini_fiba"
  | "half_mini_fiba";

export const COURT_LAYOUT_LABELS: Record<CourtLayoutType, string> = {
  full_fiba: "Cancha completa FIBA",
  half_fiba: "Media cancha FIBA",
  mini_fiba: "Cancha mini FIBA (3×3)",
  half_mini_fiba: "Media cancha mini FIBA",
};

// ── Sketch elements ───────────────────────────────────────────────────────────

export type ElementType =
  | "player_offense"
  | "player_defense"
  | "ball"
  | "cone"
  | "basket"
  | "line_move"
  | "line_dribble"
  | "line_pass"
  | "line_screen"
  | "line_cut"
  | "text";

export interface Point {
  x: number;
  y: number;
}

export interface SketchElement {
  id: string;
  type: ElementType;
  /** Posición normalizada [0.0, 1.0] */
  x: number;
  y: number;
  rotation: number;
  /** ID estable del jugador al que pertenece este elemento (RF-185) */
  playerId?: string;
  /** Para líneas de movimiento: jugador que ejecuta el movimiento (RF-187) */
  ownerId?: string;
  /** Puntos de la línea (para tipos line_*) */
  points?: Point[];
  color?: string;
  symbol?: string;
  label?: string;
  lineStyle?: "solid" | "dashed" | "dotted";
  arrowHead?: boolean;
}

// ── Sequence tree ─────────────────────────────────────────────────────────────

export interface SequenceNode {
  id: string;
  elements: SketchElement[];
  branches: SequenceNode[];
  label: string | null;
}

// ── Tag ───────────────────────────────────────────────────────────────────────

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface TagCreate {
  name: string;
  color?: string | null;
}

export interface TagUpdate {
  name?: string;
  color?: string | null;
}

// ── Drill / Play ──────────────────────────────────────────────────────────────

export interface DrillSummary {
  id: number;
  user_id: number;
  type: DrillType;
  name: string;
  court_layout: CourtLayoutType;
  description: string | null;
  parent_id: number | null;
  is_favorite: boolean;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  variant_count: number;
}

export interface Drill extends DrillSummary {
  root_sequence: SequenceNode;
}

export interface DrillCreate {
  type: DrillType;
  name: string;
  court_layout?: CourtLayoutType;
  description?: string | null;
  tag_ids?: number[];
}

export interface DrillUpdate {
  name?: string;
  court_layout?: CourtLayoutType;
  description?: string | null;
  root_sequence?: SequenceNode;
  tag_ids?: number[];
}
