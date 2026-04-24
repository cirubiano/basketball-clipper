"use client";

import type { Clip } from "@basketball-clipper/shared/types";
import { Badge } from "@/components/ui/badge";

interface ClipPlayerProps {
  clip: Clip;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipPlayer({ clip }: ClipPlayerProps) {
  return (
    <div className="space-y-4">
      <video
        className="w-full rounded-lg bg-black"
        controls
        src={clip.url}
        preload="metadata"
      />
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        {clip.team && (
          <Badge variant="secondary" className="capitalize">
            {clip.team.replace("_", " ")}
          </Badge>
        )}
        <span>Inicio: {clip.start_time.toFixed(2)}s</span>
        <span>Fin: {clip.end_time.toFixed(2)}s</span>
        <span>Duración: {formatDuration(clip.duration)}</span>
      </div>
    </div>
  );
}
