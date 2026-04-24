"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { getClips } from "@basketball-clipper/shared/api";
import { PageShell } from "@/components/layout/PageShell";
import { ClipCard } from "@/components/video/ClipCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredToken } from "@/lib/auth";

export default function DashboardPage() {
  const { data: clips, isLoading } = useQuery({
    queryKey: ["clips", "recent"],
    queryFn: () => getClips(getStoredToken()!),
  });

  const recent = clips?.slice(0, 6) ?? [];

  return (
    <PageShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Clips generados recientemente
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
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-muted-foreground">Todavía no tienes clips.</p>
            <Button asChild variant="link" className="mt-2">
              <Link href="/upload">Sube tu primer vídeo</Link>
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recent.map((clip) => (
              <ClipCard key={clip.id} clip={clip} />
            ))}
          </div>
        )}

        {(clips?.length ?? 0) > 6 && (
          <div className="flex justify-center">
            <Button asChild variant="outline">
              <Link href="/clips">Ver todos los clips</Link>
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
}
