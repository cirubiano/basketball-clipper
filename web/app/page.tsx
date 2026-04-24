"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import {
  deleteVideo,
  listVideos,
  retryVideo,
} from "@basketball-clipper/shared/api";
import type { VideoListItem } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoCard } from "@/components/video/VideoCard";
import { DeleteVideoDialog } from "@/components/video/DeleteVideoDialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredToken } from "@/lib/auth";

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<VideoListItem | null>(null);

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(getStoredToken()!),
    refetchInterval: (query) => {
      const data = query.state.data as VideoListItem[] | undefined;
      return data?.some((v) =>
        ["uploading", "pending", "processing"].includes(v.status),
      )
        ? 5000
        : false;
    },
  });

  const recent = videos?.slice(0, 6) ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteVideo(id, getStoredToken()!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
      setToDelete(null);
    },
  });

  const retryMut = useMutation({
    mutationFn: (id: number) => retryVideo(id, getStoredToken()!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
  });

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Trabajos recientes
            </p>
          </div>
          <Button asChild>
            <Link href="/upload">
              <Upload className="h-4 w-4 mr-2" />
              Subir vídeo
            </Link>
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-56 rounded-lg" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground">Todavía no tienes vídeos.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/upload">Sube tu primer vídeo</Link>
            </Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {recent.map((v) => (
                <VideoCard
                  key={v.id}
                  video={v}
                  onDelete={(x) => setToDelete(x)}
                  onRetry={(x) => retryMut.mutate(x.id)}
                />
              ))}
            </div>
            {videos && videos.length > 6 && (
              <div className="text-center">
                <Button asChild variant="link">
                  <Link href="/videos">Ver todos los vídeos →</Link>
                </Button>
              </div>
            )}
          </>
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
