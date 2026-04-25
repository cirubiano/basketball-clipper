/**
 * ElementRenderer — renderiza cada SketchElement como SVG.
 *
 * Cada tipo tiene su forma propia. Las coordenadas recibidas son ya en píxeles
 * SVG (convertidas por CourtCanvas antes de llegar aquí).
 */
"use client";

import React from "react";
import type { SketchElement } from "@basketball-clipper/shared";

interface Props {
  element: SketchElement;
  svgX: number;
  svgY: number;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
  /** Puntos en SVG para elementos de línea */
  svgPoints?: { x: number; y: number }[];
}

const PLAYER_R = 36;
const SEL_COLOR = "#facc15"; // yellow-400

function SelectionRing({ r = PLAYER_R + 8 }: { r?: number }) {
  return (
    <circle
      r={r}
      fill="none"
      stroke={SEL_COLOR}
      strokeWidth={4}
      strokeDasharray="8 4"
      pointerEvents="none"
    />
  );
}

export function ElementRenderer({
  element,
  svgX,
  svgY,
  selected,
  onPointerDown,
  svgPoints = [],
}: Props) {
  const color = element.color ?? "#ffffff";
  const rot   = element.rotation ?? 0;

  // ── Líneas ──────────────────────────────────────────────────────────────────
  if (element.type.startsWith("line_")) {
    if (svgPoints.length < 2) return null;

    const pts = svgPoints.map((p) => `${p.x},${p.y}`).join(" ");
    const isMove   = element.type === "line_move";
    const isDribble = element.type === "line_dribble";
    const isPass   = element.type === "line_pass";
    const isCut    = element.type === "line_cut";

    const strokeColor = element.color ?? (isPass ? "#60a5fa" : isMove ? "#ffffff" : "#f97316");
    const dashArray   = isCut ? "18 10" : isDribble ? "8 8" : "none";
    const markerId    = `arrow-${element.id}`;

    const last  = svgPoints[svgPoints.length - 1];
    const prev  = svgPoints[svgPoints.length - 2];
    const angle = (Math.atan2(last.y - prev.y, last.x - prev.x) * 180) / Math.PI;

    return (
      <g
        onPointerDown={onPointerDown}
        style={{ cursor: "pointer" }}
      >
        <defs>
          <marker
            id={markerId}
            markerWidth="8" markerHeight="8"
            refX="6" refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={strokeColor} />
          </marker>
        </defs>
        {/* Hit area más grande */}
        <polyline
          points={pts}
          fill="none"
          stroke="transparent"
          strokeWidth={20}
        />
        <polyline
          points={pts}
          fill="none"
          stroke={strokeColor}
          strokeWidth={selected ? 6 : 4}
          strokeDasharray={dashArray === "none" ? undefined : dashArray}
          markerEnd={`url(#${markerId})`}
        />
        {selected && svgPoints.map((p, i) => (
          <circle
            key={i}
            cx={p.x} cy={p.y} r={8}
            fill={SEL_COLOR}
            stroke="white"
            strokeWidth={2}
          />
        ))}
      </g>
    );
  }

  // ── Elementos puntuales ──────────────────────────────────────────────────────
  return (
    <g
      transform={`translate(${svgX},${svgY}) rotate(${rot})`}
      onPointerDown={onPointerDown}
      style={{ cursor: "grab" }}
    >
      {element.type === "player_offense" && (
        <>
          <circle r={PLAYER_R} fill={color} stroke="white" strokeWidth={3} />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={26}
            fontWeight="bold"
            fill={lightOrDark(color) === "dark" ? "white" : "#1a1a1a"}
            pointerEvents="none"
          >
            {element.label ?? "O"}
          </text>
          {selected && <SelectionRing />}
        </>
      )}

      {element.type === "player_defense" && (
        <>
          <circle r={PLAYER_R} fill="transparent" stroke={color} strokeWidth={5} />
          {/* X shape */}
          <line x1={-20} y1={-20} x2={20} y2={20} stroke={color} strokeWidth={6} strokeLinecap="round" />
          <line x1={20}  y1={-20} x2={-20} y2={20} stroke={color} strokeWidth={6} strokeLinecap="round" />
          {selected && <SelectionRing />}
        </>
      )}

      {element.type === "ball" && (
        <>
          <circle r={24} fill="#f97316" stroke="#c2410c" strokeWidth={3} />
          <path d="M-24,0 Q0,-8 24,0" fill="none" stroke="#c2410c" strokeWidth={2} />
          <path d="M-24,0 Q0,8 24,0"  fill="none" stroke="#c2410c" strokeWidth={2} />
          <line x1={0} y1={-24} x2={0} y2={24} stroke="#c2410c" strokeWidth={2} />
          {selected && <SelectionRing r={32} />}
        </>
      )}

      {element.type === "cone" && (
        <>
          <polygon
            points="0,-36 28,22 -28,22"
            fill={color}
            stroke="white"
            strokeWidth={3}
          />
          {selected && <SelectionRing r={36} />}
        </>
      )}

      {element.type === "basket" && (
        <>
          {/* Backboard */}
          <rect x={-8} y={-50} width={16} height={8} fill="white" />
          {/* Hoop */}
          <circle r={23} fill="none" stroke="#f97316" strokeWidth={5} />
          {selected && <SelectionRing r={36} />}
        </>
      )}

      {element.type === "text" && (
        <>
          <text
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={32}
            fill={color}
            stroke="rgba(0,0,0,0.5)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
          >
            {element.label ?? "Texto"}
          </text>
          {selected && (
            <rect
              x={-80} y={-24} width={160} height={48}
              fill="none"
              stroke={SEL_COLOR}
              strokeWidth={3}
              strokeDasharray="8 4"
            />
          )}
        </>
      )}
    </g>
  );
}

// Detecta si un color hex es oscuro o claro (para el texto del jugador)
function lightOrDark(hex: string): "light" | "dark" {
  const c = hex.replace("#", "");
  if (c.length !== 6) return "dark";
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 128 ? "light" : "dark";
}
