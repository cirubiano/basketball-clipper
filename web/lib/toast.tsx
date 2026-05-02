"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { X, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

// -- Types ------------------------------------------------------------------

type ToastType = "success" | "error";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  // #17 -- accion de deshacer opcional (muestra boton "Deshacer" y extiende timeout a 6 s)
  undoFn?: () => void;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType, undoFn?: () => void) => void;
}

// -- Context ----------------------------------------------------------------

const ToastContext = createContext<ToastContextValue | null>(null);

let _counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success", undoFn?: () => void) => {
    const id = ++_counter;
    setToasts((prev) => [...prev, { id, message, type, undoFn }]);
    // #17 -- undo toasts duran 6 s para dar tiempo a reaccionar; el resto 4 s
    setTimeout(() => dismiss(id), undoFn ? 6000 : 4000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Overlay de toasts -- esquina inferior derecha */}
      <div
        aria-live="polite"
        className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "flex items-start gap-3 rounded-lg border px-4 py-3 shadow-lg bg-background text-sm",
              t.type === "success"
                ? "border-green-200 bg-green-50 text-green-900"
                : "border-destructive/30 bg-destructive/10 text-destructive",
            )}
          >
            {t.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
            ) : (
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-destructive" />
            )}
            <span className="flex-1">{t.message}</span>
            {/* #17 -- boton Deshacer, solo cuando hay undoFn */}
            {t.undoFn && (
              <button
                onClick={() => { t.undoFn!(); dismiss(t.id); }}
                className="shrink-0 text-xs font-semibold underline underline-offset-2 opacity-80 hover:opacity-100 transition-opacity ml-1"
              >
                Deshacer
              </button>
            )}
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity ml-1"
              aria-label="Cerrar"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
