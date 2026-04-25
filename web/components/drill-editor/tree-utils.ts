/**
 * Utilidades de manipulación del árbol de SequenceNode.
 *
 * El árbol se almacena íntegro como JSON en root_sequence. Todas las
 * operaciones devuelven un nuevo árbol (inmutabilidad) para que el historial
 * de undo/redo funcione correctamente.
 */

import type { SequenceNode, SketchElement } from "@basketball-clipper/shared";

// ── Búsqueda ──────────────────────────────────────────────────────────────────

export function findNode(tree: SequenceNode, id: string): SequenceNode | null {
  if (tree.id === id) return tree;
  for (const branch of tree.branches) {
    const found = findNode(branch, id);
    if (found) return found;
  }
  return null;
}

/** Devuelve el id del nodo padre del nodo dado, o null si es el raíz. */
export function findParentId(tree: SequenceNode, targetId: string): string | null {
  for (const branch of tree.branches) {
    if (branch.id === targetId) return tree.id;
    const found = findParentId(branch, targetId);
    if (found) return found;
  }
  return null;
}

// ── Modificación inmutable ────────────────────────────────────────────────────

export function updateNodeInTree(
  tree: SequenceNode,
  id: string,
  patch: Partial<Omit<SequenceNode, "id" | "branches">>,
): SequenceNode {
  if (tree.id === id) return { ...tree, ...patch };
  return {
    ...tree,
    branches: tree.branches.map((b) => updateNodeInTree(b, id, patch)),
  };
}

export function addChildToTree(
  tree: SequenceNode,
  parentId: string,
  child: SequenceNode,
): SequenceNode {
  if (tree.id === parentId) {
    return { ...tree, branches: [...tree.branches, child] };
  }
  return {
    ...tree,
    branches: tree.branches.map((b) => addChildToTree(b, parentId, child)),
  };
}

/**
 * Elimina el nodo con el id dado y todos sus descendientes.
 * No se puede eliminar el nodo raíz (devuelve el árbol sin cambios).
 */
export function deleteNodeFromTree(
  tree: SequenceNode,
  id: string,
): SequenceNode {
  if (tree.id === id) return tree; // no borrar raíz
  return {
    ...tree,
    branches: tree.branches
      .filter((b) => b.id !== id)
      .map((b) => deleteNodeFromTree(b, id)),
  };
}

// ── Herencia de posición (RF-188, algoritmo B.3) ──────────────────────────────

/**
 * Crea un nodo hijo a partir del nodo padre aplicando la herencia de posición:
 *
 * 1. Para cada jugador del padre: si tiene una MovementLine (line_move /
 *    line_dribble) con ownerId === playerId, su nueva posición es el último
 *    punto de esa línea.
 * 2. Las MovementLines de jugadores NO se copian al hijo.
 * 3. El resto de elementos (balones, conos, anotaciones, líneas que no sean de
 *    movimiento de jugador) SÍ se copian.
 */
export function createChildNode(parent: SequenceNode): SequenceNode {
  const isPlayerEl = (el: SketchElement) =>
    el.type === "player_offense" || el.type === "player_defense";

  const isMoveLine = (el: SketchElement) =>
    el.type === "line_move" || el.type === "line_dribble";

  const newElements: SketchElement[] = [];

  for (const el of parent.elements) {
    // Las líneas de movimiento de jugador no se copian
    if (isMoveLine(el)) continue;

    if (isPlayerEl(el)) {
      // Buscar la línea de movimiento asociada a este jugador
      const moveLine = parent.elements.find(
        (e) =>
          isMoveLine(e) &&
          e.ownerId === (el.playerId ?? el.id) &&
          e.points && e.points.length >= 2,
      );

      if (moveLine?.points) {
        const lastPt = moveLine.points[moveLine.points.length - 1];
        newElements.push({
          ...el,
          id: crypto.randomUUID(), // nuevo id de elemento en este nodo
          x: lastPt.x,
          y: lastPt.y,
        });
      } else {
        newElements.push({ ...el, id: crypto.randomUUID() });
      }
    } else {
      // Copia normal de otros elementos
      newElements.push({ ...el, id: crypto.randomUUID() });
    }
  }

  return {
    id: crypto.randomUUID(),
    elements: newElements,
    branches: [],
    label: null,
  };
}

// ── Flatten tree para UI ──────────────────────────────────────────────────────

export interface FlatNode {
  node: SequenceNode;
  depth: number;
  isLeaf: boolean;
}

export function flattenTree(tree: SequenceNode, depth = 0): FlatNode[] {
  const result: FlatNode[] = [
    { node: tree, depth, isLeaf: tree.branches.length === 0 },
  ];
  for (const branch of tree.branches) {
    result.push(...flattenTree(branch, depth + 1));
  }
  return result;
}
