"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Video } from "lucide-react";
import {
  deleteVideo,
  listVideos,
  retryVideo,
} from "@basketball-clipper/shared/api";
import type { VideoListItem } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoCard } from "@/components/video/VideoCard";
import { DeleteVideoDialog } from "@/components/video/DeleteVideoDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredToken } from "@/lib/auth";

export default function VideosPage() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<VideoListItem | null>(null);

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(getStoredToken()!),
    refetchInterval: (query) => {
      const data = query.state.data as VideoListItem[] | undefined;
      const hasOngoing = data?.some((v) =>
        ["uploading", "pending", "processing"].includes(v.status),
      );
      return hasOngoing ? 5000 : false;
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteVideo(id, getStoredToken()!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
      setToDelete(null);
    },
  });

  const [retryError, setRetryError] = useState<string | null>(null);

  const retryMut = useMutation({
    mutationFn: (id: number) => retryVideo(id, getStoredToken()!),
    onSuccess: () => {
      setRetryError(null);
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: () => {
      setRetryError("No se ha podido reintentar el procesado. Inténtalo de nuevo.");
    },
  });

  return (
    <PageShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Mis vídeos</h1>
          {videos && (
            <p className="text-muted-foreground text-sm mt-1">
              {videos.length} {videos.length === 1 ? "vídeo procesado" : "vídeos procesados"}
            </p>
          )}
        </div>

        {retryError && (
          <Alert variant="destructive">
            <AlertDescription>{retryError}</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : !videos || videos.length === 0 ? (
          <div className="rounded-lg border border-dashed p-14 text-center">
            <Video className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium mb-1">Todavía no has subido ningún vídeo</p>
            <p className="text-xs text-muted-foreground mb-4">
              Sube un partido y generaremos un clip por cada posesión automáticamente.
            </p>
            <Link
              href="/upload"
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Subir primer vídeo
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {videos.map((video) => (
              <VideoCard
                key={video.id}
                video={video}
                onDelete={(v) => setToDelete(v)}
                onRetry={(v) => retryMut.mutate(v.id)}
                isRetrying={retryMut.isPending && retryMut.variables === video.id}
              />
            ))}
          </div>
        )}
      </div>

      {toDelete && (
        <DeleteVideoDialog
          video={toDelete}
          isDeleting={deleteMut.isPending}
          onCancel={() => setToDelete(null)}
          onConfirm={() => deleteMut.mutate(toDelete.id)}
        />
      )}
    </PageShell>
  );
}
