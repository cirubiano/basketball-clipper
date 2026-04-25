"use client";

import Link from "next/link";
import { Film, Loader2, RefreshCcw, Trash2, Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import type { VideoListItem, VideoStatus } from "@basketball-clipper/shared/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VideoCardProps {
  video: VideoListItem;
  onDelete?: (video: VideoListItem) => void;
  onRetry?: (video: VideoListItem) => void;
  /** true mientras el retry de este vídeo está en curso */
  isRetrying?: boolean;
}

export function VideoCard({ video, onDelete, onRetry, isRetrying = false }: VideoCardProps) {
  const isError = video.status === "error" || video.status === "invalid";
  const isProcessing = video.status === "pending" || video.status === "processing" || video.status === "uploading";
  const isDone = video.status === "completed";

  const title = video.title?.trim() || video.filename;
  const subtitle = video.title ? video.filename : null;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow hover:shadow-md",
        isError && "border-destructive/40",
      )}
    >
      <Link
        href={isProcessing ? "/upload" : `/videos/${video.id}`}
        className="block"
      >
        <div className="relative aspect-video bg-muted flex items-center justify-center">
          <StatusVisual status={video.status} />
        </div>
      </Link>

      <CardContent className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate" title={title}>
              {title}
            </p>
            {subtitle && (
              <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            )}
          </div>
          <StatusBadge status={video.status} />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {video.clips_count} {video.clips_count === 1 ? "clip" : "clips"}
          </span>
          <span>{formatRelativeDate(video.created_at)}</span>
        </div>

        {isError && video.error_message && (
          <p className="text-xs text-destructive truncate" title={video.error_message}>
            {video.error_message}
          </p>
        )}

        <div className="flex gap-1.5 pt-1">
          {isError && onRetry && (
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              disabled={isRetrying}
              onClick={(e) => {
                e.preventDefault();
                onRetry(video);
              }}
            >
              {isRetrying ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCcw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isRetrying ? "Reintentando…" : "Reintentar"}
            </Button>
          )}
          {isDone && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={`/videos/${video.id}`}>Ver clips</Link>
            </Button>
          )}
          {isProcessing && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href="/upload">Ver progreso</Link>
            </Button>
          )}
          {onDelete && (
            <Button
              size="sm"
              variant="ghost"
              onClick={(e) => {
                e.preventDefault();
                onDelete(video);
              }}
              aria-label="Borrar"
              title="Borrar"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatusVisual({ status }: { status: VideoStatus }) {
  const cls = "h-10 w-10";
  switch (status) {
    case "completed":
      return <Film className={cn(cls, "text-primary")} />;
    case "uploading":
      return <Upload className={cn(cls, "text-muted-foreground animate-pulse")} />;
    case "pending":
    case "processing":
      return <Loader2 className={cn(cls, "text-primary animate-spin")} />;
    case "error":
    case "invalid":
      return <AlertCircle className={cn(cls, "text-destructive")} />;
    default:
      return <Film className={cls} />;
  }
}

function StatusBadge({ status }: { status: VideoStatus }) {
  const labels: Record<VideoStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    uploading: { label: "Subiendo", variant: "secondary" },
    pending: { label: "En cola", variant: "secondary" },
    processing: { label: "Procesando", variant: "secondary" },
    completed: { label: "Listo", variant: "default" },
    invalid: { label: "Rechazado", variant: "destructive" },
    error: { label: "Error", variant: "destructive" },
  };
  const { label, variant } = labels[status];
  return (
    <Badge variant={variant} className="shrink-0 text-xs">
      {status === "completed" && <CheckCircle2 className="h-3 w-3 mr-1" />}
      {label}
    </Badge>
  );
}

function formatRelativeDate(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `hace ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `hace ${diffH} h`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `hace ${diffD} d`;
  return d.toLocaleDateString();
}
