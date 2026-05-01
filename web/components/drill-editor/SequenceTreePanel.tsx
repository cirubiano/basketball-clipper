/**
 * SequenceTreePanel — panel lateral del árbol de secuencias (RF-192).
 *
 * Muestra el árbol de SequenceNode de forma jerárquica. Permite:
 * - Navegar a cualquier nodo (clic).
 * - Añadir una rama hija (RF-189), con herencia de posición (RF-188).
 * - Editar la etiqueta de una rama (RF-191).
 * - Eliminar un nodo y sus descendientes con confirmación (RF-190).
 *
 * Se presenta como pestaña dentro del panel derecho del DrillEditor.
 */
"use client";

import { useState } from "react";
import type { SequenceNode } from "@basketball-clipper/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  GitBranch,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Layers,
} from "lucide-react";
import { flattenTree, type FlatNode } from "./tree-utils";
import { cn } from "@/lib/utils";

interface Props {
  tree: SequenceNode;
  activeNodeId: string;
  onNavigate: (nodeId: string) => void;
  onAddBranch: (parentNodeId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onUpdateLabel: (nodeId: string, label: string | null) => void;
}

export function SequenceTreePanel({
  tree,
  activeNodeId,
  onNavigate,
  onAddBranch,
  onDeleteNode,
  onUpdateLabel,
}: Props) {
  const flat = flattenTree(tree);

  return (
    <div className="flex flex-col gap-1 h-full overflow-y-auto py-2 px-1">
      <p className="text-[10px] text-zinc-500 uppercase tracking-wider px-1 mb-1">
        Árbol de secuencias
      </p>

      {flat.map(({ node, depth, isLeaf }) => (
        <SequenceNodeRow
          key={node.id}
          node={node}
          depth={depth}
          isLeaf={isLeaf}
          isRoot={node.id === tree.id}
          isActive={node.id === activeNodeId}
          onNavigate={() => onNavigate(node.id)}
          onAddBranch={() => onAddBranch(node.id)}
          onDelete={() => onDeleteNode(node.id)}
          onUpdateLabel={(label) => onUpdateLabel(node.id, label)}
        />
      ))}

      {flat.length === 1 && (
        <p className="text-[10px] text-zinc-600 text-center mt-2 px-2">
          Añade ramas para modelar decisiones tácticas alternativas
        </p>
      )}
    </div>
  );
}

// ── Fila individual de nodo ───────────────────────────────────────────────────

interface RowProps {
  node: SequenceNode;
  depth: number;
  isLeaf: boolean;
  isRoot: boolean;
  isActive: boolean;
  onNavigate: () => void;
  onAddBranch: () => void;
  onDelete: () => void;
  onUpdateLabel: (label: string | null) => void;
}

function SequenceNodeRow({
  node,
  depth,
  isLeaf,
  isRoot,
  isActive,
  onNavigate,
  onAddBranch,
  onDelete,
  onUpdateLabel,
}: RowProps) {
  const [editingLabel, setEditingLabel]   = useState(false);
  const [labelDraft,   setLabelDraft]     = useState(node.label ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  function commitLabel() {
    onUpdateLabel(labelDraft.trim() || null);
    setEditingLabel(false);
  }

  const playerCount = node.elements.filter(
    (el) => el.type === "player_offense" || el.type === "player_defense",
  ).length;

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-1 rounded px-1 py-1 cursor-pointer transition-colors",
          isActive
            ? "bg-blue-700/40 ring-1 ring-blue-500"
            : "hover:bg-zinc-700/50",
        )}
        style={{ paddingLeft: `${depth * 12 + 4}px` }}
        onClick={onNavigate}
      >
        {/* Conector visual de árbol */}
        {depth > 0 && (
          <span className="text-zinc-600 mr-0.5">
            <GitBranch className="h-3 w-3" />
          </span>
        )}
        {depth === 0 && (
          <Layers className="h-3 w-3 text-zinc-500 shrink-0" />
        )}

        {/* Etiqueta / nombre */}
        <div className="flex-1 min-w-0">
          {editingLabel ? (
            <Input
              autoFocus
              value={labelDraft}
              onChange={(e) => setLabelDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitLabel();
                if (e.key === "Escape") setEditingLabel(false);
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-5 text-[11px] px-1 bg-zinc-700 border-zinc-500"
              placeholder="Condición..."
            />
          ) : (
            <span className="text-[11px] text-zinc-300 truncate block">
              {isRoot
                ? "Inicio"
                : node.label ?? (
                    <span className="text-zinc-500 italic">Sin etiqueta</span>
                  )}
            </span>
          )}

          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] text-zinc-500">
              {node.elements.length} elem.
            </span>
            {isLeaf && (
              <span className="text-[9px] text-zinc-600 bg-zinc-800 px-1 rounded">
                hoja
              </span>
            )}
          </div>
        </div>

        {/* Acciones */}
        {editingLabel ? (
          <div className="flex gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
            <button onClick={commitLabel} className="text-green-400 hover:text-green-300 p-0.5">
              <Check className="h-3 w-3" />
            </button>
            <button onClick={() => setEditingLabel(false)} className="text-zinc-500 hover:text-zinc-300 p-0.5">
              <X className="h-3 w-3" />
            </button>
          </div>
        ) : (
          <div className="flex gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
               onClick={(e) => e.stopPropagation()}>
            {/* Editar etiqueta (solo no-raíz) */}
            {!isRoot && (
              <button
                title="Editar etiqueta"
                onClick={() => { setLabelDraft(node.label ?? ""); setEditingLabel(true); }}
                className="text-zinc-400 hover:text-zinc-200 p-0.5"
              >
                <Pencil className="h-3 w-3" />
              </button>
            )}
            {/* Añadir rama */}
            <button
              title="Añadir rama"
              onClick={onAddBranch}
              className="text-zinc-400 hover:text-blue-300 p-0.5"
            >
              <Plus className="h-3 w-3" />
            </button>
            {/* Eliminar (solo no-raíz) */}
            {!isRoot && (
              <button
                title="Eliminar nodo"
                onClick={() => setConfirmDelete(true)}
                className="text-zinc-400 hover:text-red-400 p-0.5"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Confirmación de borrado */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar nodo</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará este nodo y todos sus descendientes. Esta acción no se
              puede deshacer una vez guardado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setConfirmDelete(false); onDelete(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
