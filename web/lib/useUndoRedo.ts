/**
 * useUndoRedo — historial inmutable de undo/redo (RF-250 a RF-252).
 *
 * Mantiene un array de estados pasados y un índice. Undo retrocede el índice,
 * redo lo avanza. push() trunca cualquier estado "futuro" (como un editor real).
 */
import { useCallback, useState } from "react";

export interface UndoRedoHandle<T> {
  current: T;
  push: (newState: T) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  /** Resetea el historial con un estado inicial nuevo (ej. al cambiar de nodo) */
  reset: (state: T) => void;
}

export function useUndoRedo<T>(initialState: T): UndoRedoHandle<T> {
  const [history, setHistory] = useState<T[]>([initialState]);
  const [index, setIndex]     = useState(0);

  const push = useCallback((newState: T) => {
    setHistory((h) => [...h.slice(0, index + 1), newState]);
    setIndex((i) => i + 1);
  }, [index]);

  const undo = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1));
  }, []);

  const redo = useCallback(() => {
    setHistory((h) => {
      setIndex((i) => Math.min(h.length - 1, i + 1));
      return h;
    });
  }, []);

  const reset = useCallback((state: T) => {
    setHistory([state]);
    setIndex(0);
  }, []);

  return {
    current:  history[index],
    push,
    undo,
    redo,
    canUndo:  index > 0,
    canRedo:  index < history.length - 1,
    reset,
  };
}
