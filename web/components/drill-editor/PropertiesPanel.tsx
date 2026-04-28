/**
 * PropertiesPanel — panel lateral derecho que muestra y edita las propiedades
 * del elemento seleccionado (RF-220).
 */
"use client";

import type { SketchElement } from "@basketball-clipper/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2 } from "lucide-react";

const PRESET_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b",
  "#a855f7", "#ec4899", "#14b8a6", "#ffffff",
  "#1a1a1a", "#6b7280",
];

interface Props {
  element: SketchElement | null;
  onUpdate: (patch: Partial<SketchElement>) => void;
  onDelete: () => void;
}

export function PropertiesPanel({ element, onUpdate, onDelete }: Props) {
  if (!element) {
    return (
      <div className="w-52 shrink-0 bg-zinc-900 border-l border-zinc-700 p-3 flex items-center justify-center">
        <p className="text-xs text-zinc-500 text-center">
          Selecciona un elemento para ver sus propiedades
        </p>
      </div>
    );
  }

  const isLine    = element.type.startsWith("line_");
  const isPlayer  = element.type === "player_offense" || element.type === "player_defense";
  const isText    = element.type === "text";

  return (
    <div className="w-52 shrink-0 bg-zinc-900 border-l border-zinc-700 p-3 flex flex-col gap-3 overflow-y-auto">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          {typeLabel(element.type)}
        </p>
        <Button
          variant="ghost"
          size="icon"
          onClick={onDelete}
          className="h-7 w-7 text-red-400 hover:text-red-300 hover:bg-red-900/30"
          title="Eliminar"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      {/* Etiqueta / símbolo */}
      {(isPlayer || isText) && (
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">
            {isText ? "Texto" : "Símbolo"}
          </Label>
          <Input
            value={element.label ?? ""}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="h-7 text-sm bg-zinc-800 border-zinc-600"
            maxLength={isText ? 40 : 3}
          />
        </div>
      )}

      {/* Color */}
      <div className="space-y-1.5">
        <Label className="text-xs text-zinc-400">Color</Label>
        <div className="grid grid-cols-5 gap-1">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              title={c}
              onClick={() => onUpdate({ color: c })}
              style={{ background: c }}
              className={`h-6 w-full rounded border-2 transition-transform hover:scale-110
                ${element.color === c ? "border-white scale-110" : "border-zinc-600"}`}
            />
          ))}
        </div>
        <Input
          type="color"
          value={element.color ?? "#ffffff"}
          onChange={(e) => onUpdate({ color: e.target.value })}
          className="h-7 p-0.5 bg-zinc-800 border-zinc-600 cursor-pointer"
        />
      </div>

      {/* Rotación (solo elementos no-línea) */}
      {!isLine && (
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">
            Rotación: {element.rotation ?? 0}°
          </Label>
          <input
            type="range"
            min={-180} max={180} step={5}
            value={element.rotation ?? 0}
            onChange={(e) => onUpdate({ rotation: Number(e.target.value) })}
            className="w-full accent-blue-500"
          />
        </div>
      )}

      {/* Estilo de línea */}
      {isLine && (
        <div className="space-y-1">
          <Label className="text-xs text-zinc-400">Estilo</Label>
          <div className="flex gap-1">
            {(["solid", "dashed", "dotted"] as const).map((style) => (
              <button
                key={style}
                onClick={() => onUpdate({ lineStyle: style })}
                className={`flex-1 text-xs py-1 rounded border transition-colors
                  ${element.lineStyle === style || (!element.lineStyle && style === "solid")
                    ? "border-blue-500 bg-blue-900/40 text-blue-300"
                    : "border-zinc-600 text-zinc-400 hover:border-zinc-400"}`}
              >
                {style === "solid" ? "—" : style === "dashed" ? "- -" : "···"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Punta de flecha */}
      {isLine && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="arrowhead"
            checked={element.arrowHead !== false}
            onChange={(e) => onUpdate({ arrowHead: e.target.checked })}
            className="accent-blue-500"
          />
          <Label htmlFor="arrowhead" className="text-xs text-zinc-400 cursor-pointer">
            Punta de flecha
          </Label>
        </div>
      )}
    </div>
  );
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    player_offense: "Jugador ataque",
    player_defense: "Jugador defensa",
    ball:           "Balón",
    cone:           "Cono",
    basket:         "Canasta",
    text:           "Texto",
    line_move:      "Línea movimiento",
    line_dribble:   "Línea bote",
    line_pass:      "Línea pase",
    line_cut:       "Línea corte",
    line_screen:    "Bloqueo",
  };
  return map[type] ?? type;
}
