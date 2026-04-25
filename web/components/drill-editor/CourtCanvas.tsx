/**
 * CourtCanvas — canvas SVG interactivo principal.
 *
 * Responsabilidades:
 * - Renderizar la cancha (CourtBackground) + todos los elementos del nodo activo.
 * - Recibir drops desde ElementPalette.
 * - Mover elementos (drag).
 * - Seleccionar / deseleccionar elementos.
 * - Modo dibujo de líneas: cada clic añade un punto; doble clic finaliza.
 * - Tecla Delete elimina el elemento seleccionado.
 */
"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { CourtLayoutType, ElementType, SequenceNode, SketchElement } from "@basketball-clipper/shared";
import { COURT_SIZE, fromSvg, toSvg } from "./court-utils";
import { CourtBackground } from "./CourtBackground";
import { ElementRenderer } from "./ElementRenderer";

interface Props {
  layout: CourtLayoutType;
  node: SequenceNode;
  selectedId: string | null;
  drawingLineType: ElementType | null;
  onSelectElement: (id: string | null) => void;
  onNodeChange: (node: SequenceNode) => void;
  onLineDrawingDone: () => void;
}

export function CourtCanvas({
  layout,
  node,
  selectedId,
  drawingLineType,
  onSelectElement,
  onNodeChange,
  onLineDrawingDone,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const { w, h } = COURT_SIZE[layout];

  // Estado interno de arrastre
  const dragging = useRef<{
    elementId: string;
    startNormX: number;
    startNormY: number;
    startSvgX: number;
    startSvgY: number;
  } | null>(null);

  // Puntos del modo dibujo de línea (en SVG coords)
  const [pendingPoints, setPendingPoints] = useState<{ x: number; y: number }[]>([]);

  // Limpiar pendingPoints cuando salimos del modo dibujo
  useEffect(() => {
    if (!drawingLineType) setPendingPoints([]);
  }, [drawingLineType]);

  // Tecla Delete
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        deleteElement(selectedId);
      }
      if (e.key === "Escape" && drawingLineType) {
        finalizeLine();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // ── Helpers ──────────────────────────────────────────────────────────────────

  function getSvgCoords(e: React.MouseEvent | MouseEvent): { x: number; y: number } {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const scaleX = w / rect.width;
    const scaleY = h / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top)  * scaleY,
    };
  }

  function updateElements(elements: SketchElement[]) {
    onNodeChange({ ...node, elements });
  }

  function deleteElement(id: string) {
    updateElements(node.elements.filter((el) => el.id !== id));
    onSelectElement(null);
  }

  // ── Drag & Drop desde palette ─────────────────────────────────────────────

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("element-type") as ElementType;
    if (!type) return;

    const { x: svgX, y: svgY } = getSvgCoords(e as unknown as React.MouseEvent);
    const { x, y } = fromSvg(svgX, svgY, layout);

    const isPlayer = type === "player_offense" || type === "player_defense";
    const newEl: SketchElement = {
      id:       crypto.randomUUID(),
      type,
      x,
      y,
      rotation: 0,
      color:    defaultColor(type),
      label:    defaultLabel(type),
      ...(isPlayer && { playerId: crypto.randomUUID() }),
    };
    updateElements([...node.elements, newEl]);
    onSelectElement(newEl.id);
  }

  // ── Drag de elementos existentes ─────────────────────────────────────────

  function handleElementPointerDown(e: React.PointerEvent, el: SketchElement) {
    if (drawingLineType) return; // en modo dibujo, no mover elementos
    if (el.type.startsWith("line_")) {
      // Las líneas solo se seleccionan, no se arrastran
      e.stopPropagation();
      onSelectElement(el.id);
      return;
    }
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x: svgX, y: svgY } = getSvgCoords(e as unknown as React.MouseEvent);
    dragging.current = {
      elementId:   el.id,
      startNormX:  el.x,
      startNormY:  el.y,
      startSvgX:   svgX,
      startSvgY:   svgY,
    };
    onSelectElement(el.id);
  }

  function handleSvgPointerMove(e: React.PointerEvent) {
    if (!dragging.current) return;
    const { x: svgX, y: svgY } = getSvgCoords(e as unknown as React.MouseEvent);
    const { w: cw, h: ch } = COURT_SIZE[layout];
    const dx = (svgX - dragging.current.startSvgX) / cw;
    const dy = (svgY - dragging.current.startSvgY) / ch;
    const newX = Math.max(0, Math.min(1, dragging.current.startNormX + dx));
    const newY = Math.max(0, Math.min(1, dragging.current.startNormY + dy));
    updateElements(
      node.elements.map((el) =>
        el.id === dragging.current!.elementId ? { ...el, x: newX, y: newY } : el
      )
    );
  }

  function handleSvgPointerUp() {
    dragging.current = null;
  }

  // ── Modo dibujo de líneas ────────────────────────────────────────────────

  function handleCanvasClick(e: React.MouseEvent) {
    // Clic en fondo del canvas (no en elemento)
    if (!drawingLineType) {
      onSelectElement(null);
      return;
    }
    const { x: svgX, y: svgY } = getSvgCoords(e);
    setPendingPoints((pts) => [...pts, { x: svgX, y: svgY }]);
  }

  function handleCanvasDblClick(e: React.MouseEvent) {
    if (!drawingLineType) return;
    e.preventDefault();
    finalizeLine();
  }

  function finalizeLine() {
    if (pendingPoints.length < 2) {
      setPendingPoints([]);
      onLineDrawingDone();
      return;
    }
    const { w: cw, h: ch } = COURT_SIZE[layout];
    const normPoints = pendingPoints.map((p) => ({
      x: Math.max(0, Math.min(1, p.x / cw)),
      y: Math.max(0, Math.min(1, p.y / ch)),
    }));
    const firstPt = normPoints[0];
    const newEl: SketchElement = {
      id:        crypto.randomUUID(),
      type:      drawingLineType!,
      x:         firstPt.x,
      y:         firstPt.y,
      rotation:  0,
      points:    normPoints,
      arrowHead: true,
      color:     defaultColor(drawingLineType!),
    };
    updateElements([...node.elements, newEl]);
    onSelectElement(newEl.id);
    setPendingPoints([]);
    onLineDrawingDone();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const cursor = drawingLineType ? "crosshair" : "default";

  return (
    <div className="flex-1 overflow-auto bg-zinc-800 flex items-center justify-center p-4">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${w} ${h}`}
        className="max-w-full max-h-full rounded shadow-2xl"
        style={{ cursor, aspectRatio: `${w}/${h}` }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onPointerMove={handleSvgPointerMove}
        onPointerUp={handleSvgPointerUp}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDblClick}
      >
        {/* Cancha */}
        <CourtBackground layout={layout} />

        {/* Elementos del nodo */}
        {node.elements.map((el) => {
          const { x: svgX, y: svgY } = toSvg(el.x, el.y, layout);
          const { w: cw, h: ch } = COURT_SIZE[layout];
          const svgPoints = el.points?.map((p) => ({
            x: p.x * cw,
            y: p.y * ch,
          }));
          return (
            <ElementRenderer
              key={el.id}
              element={el}
              svgX={svgX}
              svgY={svgY}
              selected={el.id === selectedId}
              onPointerDown={(e) => handleElementPointerDown(e, el)}
              svgPoints={svgPoints}
            />
          );
        })}

        {/* Preview de línea en dibujo */}
        {drawingLineType && pendingPoints.length > 0 && (
          <g pointerEvents="none">
            <polyline
              points={pendingPoints.map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgba(255,255,255,0.5)"
              strokeWidth={3}
              strokeDasharray="10 6"
            />
            {pendingPoints.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={8} fill="white" opacity={0.7} />
            ))}
          </g>
        )}
      </svg>

      {/* Hint modo dibujo */}
      {drawingLineType && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2
                        bg-zinc-800/90 text-zinc-200 text-xs px-3 py-1.5 rounded-full
                        border border-zinc-600 pointer-events-none">
          Clic para añadir puntos · Doble clic o Esc para finalizar
        </div>
      )}
    </div>
  );
}

// ── Defaults por tipo ──────────────────────────────────────────────────────────

function defaultColor(type: ElementType): string {
  switch (type) {
    case "player_offense": return "#3b82f6";
    case "player_defense": return "#ef4444";
    case "ball":           return "#f97316";
    case "cone":           return "#f59e0b";
    case "line_pass":      return "#60a5fa";
    case "line_dribble":   return "#f97316";
    case "line_cut":       return "#a78bfa";
    case "line_screen":    return "#34d399";
    default:               return "#ffffff";
  }
}

function defaultLabel(type: ElementType): string {
  switch (type) {
    case "player_offense": return "1";
    case "player_defense": return "X";
    case "text":           return "Texto";
    default:               return "";
  }
}
