import Link from "next/link";
import { Play } from "lucide-react";
import type { Clip } from "@basketball-clipper/shared/types";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ClipCardProps {
  clip: Clip;
  /** Si se pasa, el link va a /videos/{videoId}/clips/{clipId} (preferido). */
  videoId?: number;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function ClipCard({ clip, videoId }: ClipCardProps) {
  const href = videoId
    ? `/videos/${videoId}/clips/${clip.id}`
    : `/videos/${clip.video_id}/clips/${clip.id}`;
  return (
    <Link href={href} className="group block">
      <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
        <div className="relative aspect-video bg-muted flex items-center justify-center">
          <Play className="h-10 w-10 text-muted-foreground group-hover:text-primary transition-colors" />
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 text-xs text-white font-mono">
            {formatDuration(clip.duration)}
          </span>
        </div>
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium truncate">Clip #{clip.id}</p>
            {clip.team && (
              <Badge variant="secondary" className="shrink-0 capitalize text-xs">
                {clip.team.replace("_", " ")}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {clip.start_time.toFixed(1)}s – {clip.end_time.toFixed(1)}s
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
