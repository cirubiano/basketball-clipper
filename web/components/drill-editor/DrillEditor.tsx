/**
 * DrillEditor — editor completo de jugadas/ejercicios.
 *
 * D1+D2: canvas editor, paleta, propiedades.
 * D3 añade:
 *   - Árbol de secuencias con navegación entre nodos (RF-192)
 *   - Herencia de posición al crear nodo hijo (RF-188 / B.3)
 *   - Undo/redo con Ctrl+Z / Ctrl+Y (RF-250 a RF-252)
 *   - Panel derecho con dos pestañas: Propiedades / Secuencias
 */
"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  CourtLayoutType,
  Drill,
  ElementType,
  SequenceNode,
  SketchElement,
} from "@basketball-clipper/shared";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Save,
  Loader2,
  ChevronLeft,
  Undo2,
  Redo2,
  Layers,
  Settings2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useUndoRedo } from "@/lib/useUndoRedo";
import { ElementPalette } from "./ElementPalette";
import { CourtCanvas } from "./CourtCanvas";
import { PropertiesPanel } from "./PropertiesPanel";
import { SequenceTreePanel } from "./SequenceTreePanel";
import {
  addChildToTree,
  createChildNode,
  deleteNodeFromTree,
  findNode,
  findParentId,
  updateNodeInTree,
} from "./tree-utils";

type RightTab = "properties" | "sequences";

interface Props {
  drill: Drill;
  onSave: (patch: {
    name?: string;
    court_layout?: CourtLayoutType;
    root_sequence?: SequenceNode;
  }) => Promise<void>;
}

export function DrillEditor({ drill, onSave }: Props) {
  const router = useRouter();

  // ── Estado del editor ────────────────────────────────────────────────────────
  const [name,         setName]        = useState(drill.name);
  const [layout,       setLayout]      = useState<CourtLayoutType>(drill.court_layout);
  const [activeNodeId, setActiveNodeId]= useState(drill.root_sequence.id);
  const [selectedId,   setSelectedId]  = useState<string | null>(null);
  const [drawingLine,  setDrawingLine] = useState<ElementType | null>(null);
  const [rightTab,     setRightTab]    = useState<RightTab>("properties");
  const [saving,       setSaving]      = useState(false);
  const [dirty,        setDirty]       = useState(false);

  // ── Undo/Redo sobre el árbol completo ────────────────────────────────────────
  const { current: tree, push, undo, redo, canUndo, canRedo } =
    useUndoRedo<SequenceNode>(drill.root_sequence);

  // Nodo activo derivado del árbol
  const activeNode = useMemo(
    () => findNode(tree, activeNodeId) ?? tree,
    [tree, activeNodeId],
  );

  // ── Atajos de teclado ────────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); setDirty(true); }
      if (mod && (e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); setDirty(true); }
      if (mod && e.key === "s") { e.preventDefault(); handleSave(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  // ── Handlers del canvas ──────────────────────────────────────────────────────

  const handleNodeChange = useCallback(
    (updated: SequenceNode) => {
      push(updateNodeInTree(tree, activeNodeId, { elements: updated.elements }));
      setDirty(true);
    },
    [tree, activeNodeId, push],
  );

  const selectedElement =
    activeNode.elements.find((el) => el.id === selectedId) ?? null;

  function handleUpdateElement(patch: Partial<SketchElement>) {
    handleNodeChange({
      ...activeNode,
      elements: activeNode.elements.map((el) =>
        el.id === selectedId ? { ...el, ...patch } : el,
      ),
    });
  }

  function handleDeleteElement() {
    if (!selectedId) return;
    handleNodeChange({
      ...activeNode,
      elements: activeNode.elements.filter((el) => el.id !== selectedId),
    });
    setSelectedId(null);
  }

  // ── Handlers del árbol de secuencias ─────────────────────────────────────────

  function handleNavigate(nodeId: string) {
    setActiveNodeId(nodeId);
    setSelectedId(null);
    setDrawingLine(null);
  }

  function handleAddBranch(parentNodeId: string) {
    const parent = findNode(tree, parentNodeId);
    if (!parent) return;
    const child    = createChildNode(parent);  // RF-188: herencia de posición
    const newTree  = addChildToTree(tree, parentNodeId, child);
    push(newTree);
    setActiveNodeId(child.id);
    setDirty(true);
    setRightTab("sequences");
  }

  function handleDeleteNode(nodeId: string) {
    if (nodeId === tree.id) return; // no borrar raíz
    const newTree  = deleteNodeFromTree(tree, nodeId);
    const parentId = findParentId(tree, nodeId) ?? tree.id;
    push(newTree);
    setActiveNodeId(parentId);
    setSelectedId(null);
    setDirty(true);
  }

  function handleUpdateLabel(nodeId: string, label: string | null) {
    push(updateNodeInTree(tree, nodeId, { label }));
    setDirty(true);
  }

  // ── Guardado ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({ name, court_layout: layout, root_sequence: tree });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  const typeLabel = drill.type === "play" ? "Jugada" : "Ejercicio";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-100">

      {/* ── Toolbar superior ──────────────────────────────────────────────── */}
      <header className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border-b border-zinc-700 shrink-0">
        <Button
          variant="ghost" size="icon"
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

        <div className="w-52 shrink-0">
          <Select
            value={layout}
            onValueChange={(v) => { setLayout(v as CourtLayoutType); setDirty(true); }}
          >
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

        {/* Separador */}
        <div className="w-px h-6 bg-zinc-700 mx-1" />

        {/* Undo / Redo */}
        <Button
          variant="ghost" size="icon"
          onClick={() => { undo(); setDirty(true); }}
          disabled={!canUndo}
          className="h-8 w-8 text-zinc-400 disabled:opacity-30"
          title="Deshacer (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost" size="icon"
          onClick={() => { redo(); setDirty(true); }}
          disabled={!canRedo}
          className="h-8 w-8 text-zinc-400 disabled:opacity-30"
          title="Rehacer (Ctrl+Y)"
        >
          <Redo2 className="h-4 w-4" />
        </Button>

        <div className="flex-1" />

        {/* Nodo activo indicador */}
        <span className="text-xs text-zinc-500 shrink-0">
          {activeNode.id === tree.id
            ? "Nodo raíz"
            : `Rama: ${activeNode.label ?? "sin etiqueta"}`}
        </span>

        {dirty && (
          <span className="text-xs text-amber-400 shrink-0">Sin guardar</span>
        )}

        <Button
          size="sm"
          onClick={handleSave}
          disabled={saving || !dirty}
          className="h-8 gap-1.5 shrink-0"
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
          node={activeNode}
          selectedId={selectedId}
          drawingLineType={drawingLine}
          onSelectElement={setSelectedId}
          onNodeChange={handleNodeChange}
          onLineDrawingDone={() => setDrawingLine(null)}
        />

        {/* Panel derecho con pestañas */}
        <div className="w-52 shrink-0 bg-zinc-900 border-l border-zinc-700 flex flex-col">

          {/* Tabs */}
          <div className="flex border-b border-zinc-700 shrink-0">
            <button
              onClick={() => setRightTab("properties")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px]
                uppercase tracking-wider transition-colors
                ${rightTab === "properties"
                  ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
                  : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <Settings2 className="h-3 w-3" />
              Props
            </button>
            <button
              onClick={() => setRightTab("sequences")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px]
                uppercase tracking-wider transition-colors
                ${rightTab === "sequences"
                  ? "text-blue-400 border-b-2 border-blue-400 -mb-px"
                  : "text-zinc-500 hover:text-zinc-300"}`}
            >
              <Layers className="h-3 w-3" />
              Árbol
            </button>
          </div>

          {/* Contenido de la pestaña */}
          <div className="flex-1 overflow-hidden">
            {rightTab === "properties" ? (
              <PropertiesPanel
                element={selectedElement}
                onUpdate={handleUpdateElement}
                onDelete={handleDeleteElement}
              />
            ) : (
              <SequenceTreePanel
                tree={tree}
                activeNodeId={activeNodeId}
                onNavigate={handleNavigate}
                onAddBranch={handleAddBranch}
                onDeleteNode={handleDeleteNode}
                onUpdateLabel={handleUpdateLabel}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
