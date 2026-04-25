/**
 * DrillEditor — editor completo de jugadas/ejercicios.
 *
 * Compone: ElementPalette + CourtCanvas + PropertiesPanel + toolbar superior.
 * Gestiona todo el estado local del editor y delega al padre el guardado.
 *
 * D3 añadirá: árbol de secuencias, undo/redo, herencia de posición.
 */
"use client";

import React, { useCallback, useState } from "react";
import type { CourtLayoutType, Drill, ElementType, SequenceNode, SketchElement } from "@basketball-clipper/shared";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Save, Loader2, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { ElementPalette } from "./ElementPalette";
import { CourtCanvas } from "./CourtCanvas";
import { PropertiesPanel } from "./PropertiesPanel";

interface Props {
  drill: Drill;
  onSave: (patch: { name?: string; court_layout?: CourtLayoutType; root_sequence?: SequenceNode }) => Promise<void>;
}

export function DrillEditor({ drill, onSave }: Props) {
  const router = useRouter();

  // Estado del sketch
  const [name, setName]               = useState(drill.name);
  const [layout, setLayout]           = useState<CourtLayoutType>(drill.court_layout);
  const [rootNode, setRootNode]       = useState<SequenceNode>(drill.root_sequence);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [drawingLine, setDrawingLine] = useState<ElementType | null>(null);
  const [saving, setSaving]           = useState(false);
  const [dirty, setDirty]             = useState(false);

  // ── Callbacks ──────────────────────────────────────────────────────────────

  const handleNodeChange = useCallback((updated: SequenceNode) => {
    setRootNode(updated);
    setDirty(true);
  }, []);

  const selectedElement = rootNode.elements.find((el) => el.id === selectedId) ?? null;

  function handleUpdateElement(patch: Partial<SketchElement>) {
    handleNodeChange({
      ...rootNode,
      elements: rootNode.elements.map((el) =>
        el.id === selectedId ? { ...el, ...patch } : el
      ),
    });
  }

  function handleDeleteElement() {
    if (!selectedId) return;
    handleNodeChange({
      ...rootNode,
      elements: rootNode.elements.filter((el) => el.id !== selectedId),
    });
    setSelectedId(null);
  }

  function handleLayoutChange(val: CourtLayoutType) {
    setLayout(val);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ name, court_layout: layout, root_sequence: rootNode });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const typeLabel = drill.type === "play" ? "Jugada" : "Ejercicio";

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">

      {/* ── Toolbar superior ──────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-3 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push("/drills")}
          className="h-8 w-8 text-zinc-400"
          title="Volver"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        <span className="text-xs text-zinc-500 shrink-0">{typeLabel}</span>

        <Input
          value={name}
          onChange={(e) => { setName(e.target.value); setDirty(true); }}
          className="h-8 max-w-xs bg-zinc-800 border-zinc-600 text-sm font-medium"
          placeholder="Nombre..."
        />

        <div className="w-52">
          <Select value={layout} onValueChange={(v) => handleLayoutChange(v as CourtLayoutType)}>
            <SelectTrigger className="h-8 bg-zinc-800 border-zinc-600 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(COURT_LAYOUT_LABELS) as CourtLayoutType[]).map((k) => (
                <SelectItem key={k} value={k} className="text-xs">
                  {COURT_LAYOUT_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1" />

        {dirty && (
          <span className="text-xs text-amber-400">Cambios sin guardar</span>
        )}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="h-8 gap-1.5"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Guardar
        </Button>
      </header>

      {/* ── Área de trabajo ───────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Paleta izquierda */}
        <ElementPalette
          drawingLineType={drawingLine}
          onSelectLineType={setDrawingLine}
        />

        {/* Canvas central */}
        <CourtCanvas
          layout={layout}
          node={rootNode}
          selectedId={selectedId}
          drawingLineType={drawingLine}
          onSelectElement={setSelectedId}
          onNodeChange={handleNodeChange}
          onLineDrawingDone={() => setDrawingLine(null)}
        />

        {/* Panel de propiedades derecho */}
        <PropertiesPanel
          element={selectedElement}
          onUpdate={handleUpdateElement}
          onDelete={handleDeleteElement}
        />
      </div>
    </div>
  );
}
