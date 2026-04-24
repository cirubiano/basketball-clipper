"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getClip } from "@basketball-clipper/shared/api";
import { PageShell } from "@/components/layout/PageShell";
import { ClipPlayer } from "@/components/video/ClipPlayer";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredToken } from "@/lib/auth";

interface ClipDetailPageProps {
  params: { id: string };
}

export default function ClipDetailPage({ params }: ClipDetailPageProps) {
  const clipId = parseInt(params.id, 10);

  const { data: clip, isLoading, error } = useQuery({
    queryKey: ["clips", clipId],
    queryFn: () => getClip(clipId, getStoredToken()!),
    enabled: !isNaN(clipId),
  });

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="icon">
            <Link href="/clips">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">
            {clip ? `Clip #${clip.id}` : "Detalle de clip"}
          </h1>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="aspect-video w-full rounded-lg" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : error ? (
          <p className="text-destructive text-sm">No se pudo cargar el clip.</p>
        ) : clip ? (
          <ClipPlayer clip={clip} />
        ) : null}
      </div>
    </PageShell>
  );
}
