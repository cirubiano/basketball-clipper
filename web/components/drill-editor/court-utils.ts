/**
 * Geometría de cancha — constantes y helpers de conversión de coordenadas.
 *
 * Todas las medidas siguen las dimensiones reales FIBA (metros).
 * En SVG usamos 1 unidad = 1 cm, por lo que 1 metro = 100 unidades.
 *
 * Las coordenadas de los elementos del sketch se almacenan normalizadas [0,1].
 * Este módulo centraliza la conversión entre espacio normalizado y SVG.
 */

import type { CourtLayoutType } from "@basketball-clipper/shared";

// ── Dimensiones de cancha (SVG units, 1 unit = 1cm) ──────────────────────────

export const COURT_SIZE: Record<CourtLayoutType, { w: number; h: number }> = {
  full_fiba:      { w: 2800, h: 1500 },
  half_fiba:      { w: 1400, h: 1500 },
  mini_fiba:      { w: 1500, h: 1100 },
  half_mini_fiba: { w:  750, h: 1100 },
};

// ── Medidas FIBA en SVG units (100 units = 1m) ────────────────────────────────

export const FIBA = {
  S:              100,     // scale: 1m = 100 units
  BASKET_DEPTH:   157.5,   // 1.575m from baseline to basket center
  KEY_WIDTH:      490,     // 4.9m wide key/paint
  KEY_DEPTH:      580,     // 5.8m deep key (to FT line)
  FT_CIRCLE_R:    180,     // 1.8m free throw circle radius
  RA_R:           125,     // 1.25m restricted area arc radius
  TP_R:           675,     // 6.75m three-point radius
  TP_CORNER:       90,     // 0.9m from sideline — start of 3pt straight line
  CENTER_CIRCLE_R: 180,    // 1.8m center circle radius
  BACKBOARD_DIST: 120,     // 1.2m from baseline to backboard
} as const;

// ── Conversión coordenadas ────────────────────────────────────────────────────

/** Normalizado [0,1] → píxeles SVG */
export function toSvg(
  x: number,
  y: number,
  layout: CourtLayoutType,
): { x: number; y: number } {
  const { w, h } = COURT_SIZE[layout];
  return { x: x * w, y: y * h };
}

/** Píxeles SVG → normalizado [0,1] (clamp al rango de la cancha) */
export function fromSvg(
  svgX: number,
  svgY: number,
  layout: CourtLayoutType,
): { x: number; y: number } {
  const { w, h } = COURT_SIZE[layout];
  return {
    x: Math.max(0, Math.min(1, svgX / w)),
    y: Math.max(0, Math.min(1, svgY / h)),
  };
}

// ── Geometría de la línea de tres puntos ──────────────────────────────────────

/**
 * Calcula el punto donde el arco de tres puntos se conecta con la línea recta
 * lateral (esquina), dado el centro del basket y el offset de la cancha.
 */
export function tpArcCornerX(basketX: number, basketY: number, cornerY: number): number {
  const dy = Math.abs(basketY - cornerY);
  if (dy >= FIBA.TP_R) return basketX; // geometría imposible, fallback
  return basketX + Math.sqrt(FIBA.TP_R * FIBA.TP_R - dy * dy);
}
