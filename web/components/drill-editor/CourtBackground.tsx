/**
 * CourtBackground — renderiza las marcas reglamentarias FIBA de la cancha.
 *
 * Es un componente SVG puro sin interactividad; se renderiza como <g> dentro
 * del canvas SVG principal. Todas las medidas respetan las dimensiones FIBA
 * reales escaladas a 1 SVG unit = 1 cm.
 */
"use client";

import type { CourtLayoutType } from "@basketball-clipper/shared";
import { COURT_SIZE, FIBA, tpArcCornerX } from "./court-utils";

interface CourtBackgroundProps {
  layout: CourtLayoutType;
}

const STROKE = "white";
const STROKE_W = 6;
const FILL_COURT = "#2d7a3a";   // verde cancha
const FILL_KEY = "#27703400";   // mismo verde (sin relleno especial)

export function CourtBackground({ layout }: CourtBackgroundProps) {
  const { w, h } = COURT_SIZE[layout];
  const cy = h / 2; // centro vertical

  // ── Basket izquierdo (todas las canchas) ────────────────────────────────────
  const lbX = FIBA.BASKET_DEPTH;   // basket center X, izq
  const lbY = cy;                   // basket center Y

  // Key izquierda
  const keyTop    = cy - FIBA.KEY_WIDTH / 2;
  const keyBottom = cy + FIBA.KEY_WIDTH / 2;
  const ftX       = FIBA.KEY_DEPTH;

  // 3pt izquierda
  const tpCornerY_top = FIBA.TP_CORNER;
  const tpCornerY_bot = h - FIBA.TP_CORNER;
  const tpArcX_l      = tpArcCornerX(lbX, lbY, tpCornerY_top);

  // ── Basket derecho (solo full_fiba y half_fiba con dos canastas) ────────────
  const hasTwoBuckets = layout === "full_fiba";
  const rbX = w - FIBA.BASKET_DEPTH;
  const rbY = cy;
  const tpArcX_r = w - tpArcCornerX(FIBA.BASKET_DEPTH, 0, tpCornerY_top - cy + cy);
  // Equivalente: w - tpArcX_l (simetría)
  const tpArcX_r2 = w - tpArcX_l;

  return (
    <g>
      {/* ── Fondo cancha ─────────────────────────────────────────────────── */}
      <rect x={0} y={0} width={w} height={h} fill={FILL_COURT} />

      {/* ── Clip path para marcas ────────────────────────────────────────── */}
      <defs>
        <clipPath id="court-clip">
          <rect x={0} y={0} width={w} height={h} />
        </clipPath>
      </defs>

      <g clipPath="url(#court-clip)" stroke={STROKE} strokeWidth={STROKE_W} fill="none">

        {/* ── Borde de cancha ──────────────────────────────────────────────── */}
        <rect x={0} y={0} width={w} height={h} />

        {/* ── Línea central (solo full_fiba) ───────────────────────────────── */}
        {layout === "full_fiba" && (
          <>
            <line x1={w / 2} y1={0} x2={w / 2} y2={h} />
            <circle cx={w / 2} cy={cy} r={FIBA.CENTER_CIRCLE_R} />
          </>
        )}

        {/* ══ EXTREMO IZQUIERDO ════════════════════════════════════════════════ */}

        {/* Key / zona pintada izquierda */}
        <rect x={0} y={keyTop} width={ftX} height={FIBA.KEY_WIDTH}
              stroke={STROKE} strokeWidth={STROKE_W} />

        {/* Línea de tiro libre — arco superior (sólido) */}
        <path
          d={`M ${ftX} ${keyTop} A ${FIBA.FT_CIRCLE_R} ${FIBA.FT_CIRCLE_R} 0 0 1 ${ftX} ${keyBottom}`}
          strokeDasharray="none"
        />
        {/* Arco inferior (discontinuo) */}
        <path
          d={`M ${ftX} ${keyTop} A ${FIBA.FT_CIRCLE_R} ${FIBA.FT_CIRCLE_R} 0 0 0 ${ftX} ${keyBottom}`}
          strokeDasharray="20 15"
        />

        {/* Zona restringida izquierda */}
        <path
          d={`M ${lbX} ${lbY - FIBA.RA_R} A ${FIBA.RA_R} ${FIBA.RA_R} 0 0 1 ${lbX} ${lbY + FIBA.RA_R}`}
        />

        {/* Backboard izquierdo */}
        <line
          x1={FIBA.BACKBOARD_DIST} y1={cy - 91.5}
          x2={FIBA.BACKBOARD_DIST} y2={cy + 91.5}
          strokeWidth={STROKE_W * 1.5}
        />
        {/* Aro izquierdo */}
        <circle cx={lbX} cy={lbY} r={23} strokeWidth={STROKE_W} />

        {/* Línea de 3 puntos izquierda */}
        <path
          d={
            `M 0 ${tpCornerY_top} L ${tpArcX_l} ${tpCornerY_top} ` +
            `A ${FIBA.TP_R} ${FIBA.TP_R} 0 1 1 ${tpArcX_l} ${tpCornerY_bot} ` +
            `L 0 ${tpCornerY_bot}`
          }
        />

        {/* ══ EXTREMO DERECHO (full_fiba) ══════════════════════════════════════ */}
        {hasTwoBuckets && (
          <>
            {/* Key derecha */}
            <rect x={w - ftX} y={keyTop} width={ftX} height={FIBA.KEY_WIDTH} />

            {/* Arco tiro libre derecho — superior sólido */}
            <path
              d={`M ${w - ftX} ${keyTop} A ${FIBA.FT_CIRCLE_R} ${FIBA.FT_CIRCLE_R} 0 0 0 ${w - ftX} ${keyBottom}`}
            />
            {/* Arco inferior discontinuo */}
            <path
              d={`M ${w - ftX} ${keyTop} A ${FIBA.FT_CIRCLE_R} ${FIBA.FT_CIRCLE_R} 0 0 1 ${w - ftX} ${keyBottom}`}
              strokeDasharray="20 15"
            />

            {/* Zona restringida derecha */}
            <path
              d={`M ${rbX} ${rbY - FIBA.RA_R} A ${FIBA.RA_R} ${FIBA.RA_R} 0 0 0 ${rbX} ${rbY + FIBA.RA_R}`}
            />

            {/* Backboard derecho */}
            <line
              x1={w - FIBA.BACKBOARD_DIST} y1={cy - 91.5}
              x2={w - FIBA.BACKBOARD_DIST} y2={cy + 91.5}
              strokeWidth={STROKE_W * 1.5}
            />
            {/* Aro derecho */}
            <circle cx={rbX} cy={rbY} r={23} strokeWidth={STROKE_W} />

            {/* 3 puntos derecha */}
            <path
              d={
                `M ${w} ${tpCornerY_top} L ${tpArcX_r2} ${tpCornerY_top} ` +
                `A ${FIBA.TP_R} ${FIBA.TP_R} 0 1 0 ${tpArcX_r2} ${tpCornerY_bot} ` +
                `L ${w} ${tpCornerY_bot}`
              }
            />
          </>
        )}
      </g>
    </g>
  );
}
