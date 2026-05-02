"use client";

/**
 * Widget flotante que muestra el progreso del upload/procesado cuando el
 * usuario navega fuera de /upload. Se oculta solo cuando no hay job activo
 * o cuando ya estás en /upload (la página tiene su propia UI detallada).
 *
 * Responsive:
 *   - Desktop (sm+): tarjeta de ~320px en esquina inferior derecha
 *   - Mobile: ocupa el ancho con margen lateral; también en bottom-right
 *     pero más compacto. Se puede plegar/desplegar tocando el cabecero.
 */
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Upload,
  X,
  XCircle,
} from "lucide-react";
import { useUploadJob, type UploadJob } from "@/lib/uploadJob";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function FloatingUploadWidget() {
  const { job, cancel, clearJob } = useUploadJob();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Ocultar el widget si: no hay job, o el usuario ya está viendo la página
  // detallada de upload (evita doble UI).
  if (!job) return null;
  if (pathname === "/upload") return null;

  const terminal = job.stage === "done" || job.stage === "error";

  return (
    <div
      className={cn(
        // Posición
        "fixed z-50",
        "bottom-4 right-4",
        // Responsive width
        "left-4 sm:left-auto",         // mobile: full width con márgenes
        "sm:w-80",                      // desktop: 320px fijo
        // Estilo
        "rounded-xl border bg-background shadow-lg",
        "transition-all duration-200",
      )}
      role="status"
      aria-live="polite"
    >
      {/* Header — clickable para plegar/desplegar */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
        aria-expanded={!collapsed}
      >
        <StageIcon stage={job.stage} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{titleFor(job)}</p>
          <p className="text-xs text-muted-foreground truncate">{job.filename}</p>
        </div>
        {collapsed ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Body — progress + actions */}
      {!collapsed && (
        <div className="px-3 pb-3 space-y-3 border-t">
          <div className="pt-3 space-y-1.5">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{subtitleFor(job)}</span>
              <span className="font-medium tabular-nums">
                {percentFor(job)}%
              </span>
            </div>
            <Progress value={percentFor(job)} className="h-1.5" />
            {/* #37 — part-level indicator during upload */}
            {job.stage === "uploading" && job.totalParts > 1 && (
              <div className="flex gap-1 mt-1.5 flex-wrap">
                {Array.from({ length: job.totalParts }).map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 min-w-[8px] rounded-full transition-colors duration-300",
                      i < job.uploadedParts
                        ? "bg-primary"
                        : i === job.uploadedParts
                        ? "bg-primary/50 animate-pulse"
                        : "bg-muted",
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          {job.stage === "error" && job.errorMessage && (
            <p className="text-xs text-destructive break-words">
              {job.errorMessage}
            </p>
          )}

          <div className="flex gap-2">
            {job.stage === "uploading" || job.stage === "processing" ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => router.push("/upload")}
                >
                  Ver detalles
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void cancel()}
                  aria-label="Cancelar"
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : null}

            {job.stage === "done" && (
              <>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    const id = job.videoId;
                    clearJob();
                    if (id) {
                      router.push(`/videos/${id}`);
                    } else {
                      router.push("/videos");
                    }
                  }}
                >
                  Ver clips
                </Button>
                <Button size="sm" variant="ghost" onClick={clearJob} aria-label="Cerrar">
                  <X className="h-4 w-4" />
                </Button>
              </>
            )}

            {job.stage === "error" && (
              <Button size="sm" variant="outline" className="flex-1" onClick={clearJob}>
                Descartar
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StageIcon({ stage }: { stage: UploadJob["stage"] }) {
  const cls = "h-5 w-5 shrink-0";
  if (stage === "done") return <CheckCircle2 className={cn(cls, "text-primary")} />;
  if (stage === "error") return <XCircle className={cn(cls, "text-destructive")} />;
  if (stage === "uploading") return <Upload className={cn(cls, "text-primary")} />;
  return <Loader2 className={cn(cls, "text-primary animate-spin")} />;
}

function titleFor(job: UploadJob): string {
  if (job.stage === "uploading") return "Subiendo vídeo...";
  if (job.stage === "processing") return "Procesando...";
  if (job.stage === "done") return "¡Clips listos!";
  return "Error";
}

function subtitleFor(job: UploadJob): string {
  if (job.stage === "uploading") {
    // #37 — show per-part progress for better visibility of system status
    if (job.totalParts > 0) {
      return `Parte ${Math.min(job.uploadedParts + 1, job.totalParts)} de ${job.totalParts}`;
    }
    return "Preparando subida…";
  }
  if (job.stage === "processing") {
    const s = job.processingStatus;
    if (s === "processing") return "Detectando posesiones";
    if (s === "completed") return "Completado";
    return "En cola";
  }
  if (job.stage === "done") return "Procesado completado";
  return "Falló el procesado";
}

function percentFor(job: UploadJob): number {
  if (job.stage === "uploading") return job.uploadPercent;
  if (job.stage === "done") return 100;
  if (job.stage === "error") return 100;
  return job.processingPercent;
}
