"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload,
  Users,
  BookOpen,
  Video,
  CalendarDays,
  LayoutGrid,
  Info,
  ClipboardList,
} from "lucide-react";
import { deleteVideo, listVideos, retryVideo } from "@basketball-clipper/shared/api";
import type { VideoListItem } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoCard } from "@/components/video/VideoCard";
import { DeleteVideoDialog } from "@/components/video/DeleteVideoDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { getStoredToken, useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface QuickLink {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bg: string;
}

function tdLinks(clubId: number): QuickLink[] {
  return [
    {
      href: `/clubs/${clubId}/teams`,
      icon: Users,
      label: "Equipos",
      description: "Gestiona los equipos de tu club",
      color: "text-blue-600",
      bg: "bg-blue-50 hover:bg-blue-100",
    },
    {
      href: `/clubs/${clubId}/seasons`,
      icon: CalendarDays,
      label: "Temporadas",
      description: "Administra las temporadas activas",
      color: "text-amber-600",
      bg: "bg-amber-50 hover:bg-amber-100",
    },
    {
      href: `/players`,
      icon: ClipboardList,
      label: "Jugadores",
      description: "Plantilla de jugadores del club",
      color: "text-green-600",
      bg: "bg-green-50 hover:bg-green-100",
    },
    {
      href: `/clubs/${clubId}/catalog`,
      icon: LayoutGrid,
      label: "Catálogo",
      description: "Jugadas y ejercicios compartidos",
      color: "text-purple-600",
      bg: "bg-purple-50 hover:bg-purple-100",
    },
  ];
}

function coachLinks(clubId: number, teamId: number | null): QuickLink[] {
  return [
    ...(teamId
      ? [
          {
            href: `/teams/${teamId}/roster`,
            icon: Users,
            label: "Mi Equipo",
            description: "Plantilla y gestión del equipo",
            color: "text-blue-600",
            bg: "bg-blue-50 hover:bg-blue-100",
          },
        ]
      : []),
    {
      href: `/clubs/${clubId}/catalog`,
      icon: LayoutGrid,
      label: "Catálogo del club",
      description: "Jugadas y ejercicios compartidos",
      color: "text-purple-600",
      bg: "bg-purple-50 hover:bg-purple-100",
    },
    {
      href: "/drills",
      icon: BookOpen,
      label: "Mi Biblioteca",
      description: "Tus jugadas y ejercicios personales",
      color: "text-indigo-600",
      bg: "bg-indigo-50 hover:bg-indigo-100",
    },
    {
      href: "/upload",
      icon: Upload,
      label: "Subir vídeo",
      description: "Analiza un partido automáticamente",
      color: "text-rose-600",
      bg: "bg-rose-50 hover:bg-rose-100",
    },
  ];
}

function soloLinks(): QuickLink[] {
  return [
    {
      href: "/drills",
      icon: BookOpen,
      label: "Mi Biblioteca",
      description: "Crea y organiza jugadas y ejercicios",
      color: "text-purple-600",
      bg: "bg-purple-50 hover:bg-purple-100",
    },
    {
      href: "/upload",
      icon: Upload,
      label: "Subir vídeo",
      description: "Analiza un partido y genera clips",
      color: "text-blue-600",
      bg: "bg-blue-50 hover:bg-blue-100",
    },
  ];
}

export default function DashboardPage() {
  const { user, activeProfile } = useAuth();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<VideoListItem | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const role = activeProfile?.role;
  const clubId = activeProfile?.club_id;
  const teamId = activeProfile?.team_id ?? null;
  const isTD = role === "technical_director";

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(getStoredToken()!),
    enabled: !isTD,  // DT no necesita esta sección
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
      setRetryError(null);
      void queryClient.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: () => {
      setRetryError("No se ha podido reintentar el procesado. Inténtalo de nuevo.");
    },
  });

  let heading: string;
  let subheading: string;
  let quickLinks: QuickLink[];

  if (!activeProfile) {
    const firstName = user?.email?.split("@")[0] ?? "entrenador";
    heading = "Tu espacio personal";
    subheading = `Hola, ${firstName}`;
    quickLinks = soloLinks();
  } else if (isTD) {
    heading = `Bienvenido a ${activeProfile.club_name ?? "tu club"}`;
    subheading = activeProfile.season_name ?? "";
    quickLinks = tdLinks(clubId!);
  } else {
    const parts = [activeProfile.team_name, activeProfile.club_name].filter(Boolean);
    heading = parts.length > 0 ? parts.join(" · ") : "Bienvenido";
    subheading = activeProfile.season_name ?? "";
    quickLinks = coachLinks(clubId!, teamId);
  }

  const gridCols =
    quickLinks.length === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : quickLinks.length === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <PageShell requireProfile={false}>
      <div className="space-y-8">

        <div>
          <h1 className="text-2xl font-bold">{heading}</h1>
          {subheading && (
            <p className="text-muted-foreground text-sm mt-1">{subheading}</p>
          )}
        </div>

        {!activeProfile && (
          <Alert className="border-blue-200 bg-blue-50 text-blue-800">
            <Info className="h-4 w-4 shrink-0 text-blue-500" />
            <AlertDescription>
              Tu cuenta está activa. Si eres invitado a un club, tus perfiles
              aparecerán en el selector de perfil. Mientras tanto, puedes usar
              tu biblioteca personal y subir vídeos.
            </AlertDescription>
          </Alert>
        )}

        <div>
          <h2 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
            Accesos rápidos
          </h2>
          <div className={cn("grid gap-3", gridCols)}>
            {quickLinks.map(({ href, icon: Icon, label, description, color, bg }) => (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-start gap-3 rounded-lg border p-4 transition-colors",
                  bg,
                )}
              >
                <div className={cn("mt-0.5 shrink-0", color)}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {!isTD && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Vídeos recientes
              </h2>
              {videos && videos.length > 0 && (
                <Link href="/videos" className="text-xs text-primary hover:underline">
                  Ver todos
                </Link>
              )}
            </div>

            {retryError && (
              <Alert variant="destructive" className="mb-4">
                <AlertDescription>{retryError}</AlertDescription>
              </Alert>
            )}

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-56 rounded-lg" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <div className="rounded-lg border border-dashed p-10 text-center">
                <Video className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
                <p className="text-sm font-medium mb-1">Aún no hay vídeos procesados</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Sube un partido y generaremos un clip por cada cambio de posesión de forma automática.
                </p>
                <Link
                  href="/upload"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  <Upload className="h-3.5 w-3.5" />
                  Subir primer vídeo
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {recent.map((v) => (
                  <VideoCard
                    key={v.id}
                    video={v}
                    onDelete={(x) => setToDelete(x)}
                    onRetry={(x) => retryMut.mutate(x.id)}
                    isRetrying={retryMut.isPending && retryMut.variables === v.id}
                  />
                ))}
              </div>
            )}
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
