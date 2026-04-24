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
import type { VideoListItem } from "@basketball-clipper/shared/types";
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
          <div className="py-12 text-center text-sm text-muted-foreground">
            {video?.status === "processing" || video?.status === "pending"
              ? "El vídeo aún se está procesando..."
              : "No hay clips disponibles para este vídeo."}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {clips.map((clip) => (
              <ClipCard key={clip.id} clip={clip} videoId={videoId} />
            ))}
          </div>
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
