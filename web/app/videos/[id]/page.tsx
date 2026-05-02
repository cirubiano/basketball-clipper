"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { ArrowLeft, RefreshCcw, Trash2 } from "lucide-react";
import {
  deleteVideo,
  listVideoClips,
  listVideos,
  retryVideo,
} from "@basketball-clipper/shared/api";
import type { VideoListItem, Clip } from "@basketball-clipper/shared/types";
import { cn } from "@/lib/utils";
import { PageShell } from "@/components/layout/PageShell";
import { ClipCard } from "@/components/video/ClipCard";
import { DeleteVideoDialog } from "@/components/video/DeleteVideoDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { getStoredToken } from "@/lib/auth";

interface PageProps {
  params: { id: string };
}

export default function VideoDetailPage({ params }: PageProps) {
  const videoId = parseInt(params.id, 10);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showDelete, setShowDelete] = useState(false);

  // Reutilizamos la query del listado para encontrar este video sin pegarle
  // un endpoint extra. Si no estuviera (refresh directo), caemos al filename.
  const { data: videos } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(getStoredToken()!),
  });
  const video = videos?.find((v) => v.id === videoId);

  const { data: clips, isLoading } = useQuery({
    queryKey: ["videos", videoId, "clips"],
    queryFn: () => listVideoClips(videoId, getStoredToken()!),
    enabled: !isNaN(videoId),
    refetchInterval: (query) => {
      // Refrescar mientras el video no esté terminal
      if (!video) return false;
      const ongoing = ["uploading", "pending", "processing"].includes(video.status);
      return ongoing ? 5000 : false;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteVideo(id, getStoredToken()!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
      router.push("/videos");
    },
  });

  const retryMut = useMutation({
    mutationFn: (id: number) => retryVideo(id, getStoredToken()!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
  });

  const title = video?.title?.trim() || video?.filename || `Vídeo #${videoId}`;
  const isError = video?.status === "error" || video?.status === "invalid";

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-start gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/videos">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">{title}</h1>
            {video && (
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <span>{video.filename}</span>
                <span>·</span>
                <Badge variant="outline" className="text-xs">
                  {video.status}
                </Badge>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {isError && video && (
              <Button variant="outline" onClick={() => retryMut.mutate(video.id)}>
                <RefreshCcw className="h-4 w-4 mr-2" />
                Reintentar
              </Button>
            )}
            {video && (
              <Button variant="ghost" onClick={() => setShowDelete(true)}>
                <Trash2 className="h-4 w-4 mr-2" />
                Borrar
              </Button>
            )}
          </div>
        </div>

        {isError && video?.error_message && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {video.error_message}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : !clips || clips.length === 0 ? (
          <div className="rounded-lg border border-dashed py-14 text-center text-muted-foreground">
            {video?.status === "processing" || video?.status === "pending" ? (
              <>
                <div className="h-8 w-8 mx-auto mb-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-sm font-medium">El vídeo se está procesando…</p>
                <p className="text-xs mt-1">Los clips aparecerán aquí cuando termine el análisis.</p>
              </>
            ) : (
              <>
                <p className="text-4xl mb-3">🎬</p>
                <p className="text-sm font-medium mb-1">No se generaron clips</p>
                <p className="text-xs">No se detectaron posesiones en este vídeo o ocurrió un error durante el procesado.</p>
              </>
            )}
          </div>
        ) : (
          <>
            {clips && clips.length > 0 && (
              <PossessionTimeline clips={clips} videoId={videoId} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {clips.map((clip) => (
                <ClipCard key={clip.id} clip={clip} videoId={videoId} />
              ))}
            </div>
          </>
        )}
      </div>

      {showDelete && video && (
        <DeleteVideoDialog
          video={video}
          isDeleting={deleteMut.isPending}
          onCancel={() => setShowDelete(false)}
          onConfirm={() => deleteMut.mutate(video.id)}
        />
      )}
    </PageShell>
  );
}

// ── PossessionTimeline ────────────────────────────────────────────────────────

function PossessionTimeline({ clips, videoId }: { clips: Clip[]; videoId: number }) {
  const totalDuration = Math.max(...clips.map((c) => c.end_time), 0);
  if (totalDuration === 0) return null;

  const teamAClips = clips.filter((c) => c.team === "team_a");
  const teamBClips = clips.filter((c) => c.team === "team_b");
  const teamATime = teamAClips.reduce((s, c) => s + c.duration, 0);
  const teamBTime = teamBClips.reduce((s, c) => s + c.duration, 0);
  const coveredTime = teamATime + teamBTime;
  const teamAPct = coveredTime > 0 ? Math.round((teamATime / coveredTime) * 100) : 0;
  const teamBPct = coveredTime > 0 ? 100 - teamAPct : 0;

  function formatTime(s: number): string {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Línea de posesiones</h3>
        <span className="text-xs text-muted-foreground">{formatTime(totalDuration)} total</span>
      </div>

      {/* Possession bar */}
      <div className="relative h-8 rounded-md overflow-hidden bg-muted flex">
        {clips
          .slice()
          .sort((a, b) => a.start_time - b.start_time)
          .map((clip) => {
            const left = (clip.start_time / totalDuration) * 100;
            const width = (clip.duration / totalDuration) * 100;
            const isTeamA = clip.team === "team_a";
            return (
              <a
                key={clip.id}
                href={`/videos/${videoId}/clips/${clip.id}`}
                title={`Clip #${clip.id} — ${clip.team ?? "desconocido"} · ${formatTime(clip.start_time)}–${formatTime(clip.end_time)}`}
                className={cn(
                  "absolute top-0 h-full transition-opacity hover:opacity-80 cursor-pointer border-r border-background/30",
                  isTeamA
                    ? "bg-blue-500 dark:bg-blue-400"
                    : "bg-amber-500 dark:bg-amber-400",
                )}
                style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
              />
            );
          })}
      </div>

      {/* Possession stats */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-blue-500 dark:bg-blue-400 inline-block shrink-0" />
          <span className="font-medium text-foreground">{teamAPct}%</span>
          <span>Equipo A · {formatTime(teamATime)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-500 dark:bg-amber-400 inline-block shrink-0" />
          <span className="font-medium text-foreground">{teamBPct}%</span>
          <span>Equipo B · {formatTime(teamBTime)}</span>
        </div>
        <span className="ml-auto">{clips.length} clip{clips.length !== 1 ? "s" : ""}</span>
      </div>
    </div>
  );
}
