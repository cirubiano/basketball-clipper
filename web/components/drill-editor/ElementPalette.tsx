/**
 * ElementPalette — barra lateral izquierda con los elementos arrastrables al canvas.
 *
 * Cada item tiene una representación SVG compacta. Al arrastrar al canvas, se
 * pasa el tipo del elemento via dataTransfer.
 */
"use client";

import React from "react";
import type { ElementType } from "@basketball-clipper/shared";

interface PaletteItem {
  type: ElementType;
  label: string;
  icon: React.ReactNode;
  isLine?: boolean;
}

const ITEMS: PaletteItem[] = [
  {
    type: "player_offense",
    label: "Ataque",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <circle r={18} fill="#3b82f6" stroke="white" strokeWidth={2} />
        <text textAnchor="middle" dominantBaseline="central" fontSize={14} fontWeight="bold" fill="white">O</text>
      </svg>
    ),
  },
  {
    type: "player_defense",
    label: "Defensa",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <circle r={18} fill="transparent" stroke="#ef4444" strokeWidth={3} />
        <line x1={-10} y1={-10} x2={10} y2={10} stroke="#ef4444" strokeWidth={4} strokeLinecap="round" />
        <line x1={10}  y1={-10} x2={-10} y2={10} stroke="#ef4444" strokeWidth={4} strokeLinecap="round" />
      </svg>
    ),
  },
  {
    type: "ball",
    label: "Balón",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <circle r={16} fill="#f97316" stroke="#c2410c" strokeWidth={2} />
      </svg>
    ),
  },
  {
    type: "cone",
    label: "Cono",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <polygon points="0,-18 14,10 -14,10" fill="#f59e0b" stroke="white" strokeWidth={2} />
      </svg>
    ),
  },
  {
    type: "basket",
    label: "Canasta",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <rect x={-4} y={-20} width={8} height={5} fill="white" />
        <circle r={12} fill="none" stroke="#f97316" strokeWidth={4} />
      </svg>
    ),
  },
  {
    type: "text",
    label: "Texto",
    icon: (
      <svg width={40} height={40} viewBox="-24 -24 48 48">
        <text textAnchor="middle" dominantBaseline="central" fontSize={28} fontWeight="bold" fill="white">T</text>
      </svg>
    ),
  },
];

const LINE_ITEMS: PaletteItem[] = [
  {
    type: "line_move",
    label: "Movimiento",
    isLine: true,
    icon: (
      <svg width={40} height={24} viewBox="0 0 40 24">
        <defs>
          <marker id="arr-move" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="white" />
          </marker>
        </defs>
        <line x1={4} y1={12} x2={36} y2={12} stroke="white" strokeWidth={3} markerEnd="url(#arr-move)" />
      </svg>
    ),
  },
  {
    type: "line_dribble",
    label: "Bote",
    isLine: true,
    icon: (
      <svg width={40} height={24} viewBox="0 0 40 24">
        <defs>
          <marker id="arr-drib" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#f97316" />
          </marker>
        </defs>
        <line x1={4} y1={12} x2={36} y2={12} stroke="#f97316" strokeWidth={3}
              strokeDasharray="6 5" markerEnd="url(#arr-drib)" />
      </svg>
    ),
  },
  {
    type: "line_pass",
    label: "Pase",
    isLine: true,
    icon: (
      <svg width={40} height={24} viewBox="0 0 40 24">
        <defs>
          <marker id="arr-pass" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#60a5fa" />
          </marker>
        </defs>
        <line x1={4} y1={12} x2={36} y2={12} stroke="#60a5fa" strokeWidth={3} markerEnd="url(#arr-pass)" />
      </svg>
    ),
  },
  {
    type: "line_cut",
    label: "Corte",
    isLine: true,
    icon: (
      <svg width={40} height={24} viewBox="0 0 40 24">
        <defs>
          <marker id="arr-cut" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 z" fill="#a78bfa" />
          </marker>
        </defs>
        <line x1={4} y1={12} x2={36} y2={12} stroke="#a78bfa" strokeWidth={3}
              strokeDasharray="12 6" markerEnd="url(#arr-cut)" />
      </svg>
    ),
  },
  {
    type: "line_screen",
    label: "Bloqueo",
    isLine: true,
    icon: (
      <svg width={40} height={24} viewBox="0 0 40 24">
        <line x1={4} y1={12} x2={36} y2={12} stroke="#34d399" strokeWidth={4} />
        <line x1={36} y1={4}  x2={36} y2={20} stroke="#34d399" strokeWidth={6} strokeLinecap="round" />
      </svg>
    ),
  },
];

interface ElementPaletteProps {
  drawingLineType: ElementType | null;
  onSelectLineType: (type: ElementType | null) => void;
}

export function ElementPalette({ drawingLineType, onSelectLineType }: ElementPaletteProps) {
  function handleDragStart(e: React.DragEvent, type: ElementType) {
    e.dataTransfer.setData("element-type", type);
    e.dataTransfer.effectAllowed = "copy";
  }

  return (
    <div className="flex flex-col gap-1 w-16 shrink-0 bg-zinc-900 border-r border-zinc-700 py-2 px-1 overflow-y-auto">
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider text-center mb-1">Elem.</p>
      {ITEMS.map((item) => (
        <div
          key={item.type}
          draggable
          onDragStart={(e) => handleDragStart(e, item.type)}
          title={item.label}
          className="flex flex-col items-center gap-0.5 rounded p-1 cursor-grab
                     hover:bg-zinc-700 active:bg-zinc-600 transition-colors select-none"
        >
          {item.icon}
          <span className="text-[9px] text-zinc-400 text-center leading-tight">{item.label}</span>
        </div>
      ))}

      <div className="border-t border-zinc-700 my-1" />
      <p className="text-[9px] text-zinc-500 uppercase tracking-wider text-center mb-1">Líneas</p>

      {LINE_ITEMS.map((item) => {
        const isActive = drawingLineType === item.type;
        return (
          <button
            key={item.type}
            title={`Dibujar: ${item.label}`}
            onClick={() => onSelectLineType(isActive ? null : item.type)}
            className={`flex flex-col items-center gap-0.5 rounded p-1 transition-colors select-none
              ${isActive
                ? "bg-blue-600 ring-2 ring-blue-400"
                : "hover:bg-zinc-700"}`}
          >
            {item.icon}
            <span className="text-[9px] text-zinc-400 text-center leading-tight">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
