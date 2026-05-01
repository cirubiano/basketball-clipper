"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import {
  Upload,
  Users,
  BookOpen,
  Video,
  CalendarDays,
  LayoutGrid,
  Info,
  ClipboardList,
  Trophy,
  Dumbbell,
} from "lucide-react";
import {
  deleteVideo,
  listVideos,
  retryVideo,
  getSeasons,
  getTeams,
  listPlayers,
  listMatches,
  listTrainings,
} from "@basketball-clipper/shared/api";
import type { VideoListItem } from "@basketball-clipper/shared/types";
import { MATCH_LOCATION_LABELS, profileLabel } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoCard } from "@/components/video/VideoCard";
import { DeleteVideoDialog } from "@/components/video/DeleteVideoDialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const { user, activeProfile, profiles, token, switchProfile } = useAuth();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<VideoListItem | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  const role = activeProfile?.role;
  const clubId = activeProfile?.club_id;
  const teamId = activeProfile?.team_id ?? null;
  const isTD = role === "technical_director";

  // ── TD dashboard queries ────────────────────────────────────────────────────

  const { data: seasons = [], isLoading: loadingSeasons } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: isTD && !!token && !!clubId,
  });

  const { data: allTeams = [], isLoading: loadingTeams } = useQuery({
    queryKey: ["teams", clubId],
    queryFn: () => getTeams(token!, clubId!),
    enabled: isTD && !!token && !!clubId,
  });

  const { data: allPlayers = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ["players", clubId, false],
    queryFn: () => listPlayers(token!, clubId!, false),
    enabled: isTD && !!token && !!clubId,
  });

  const activeTeamsTD = allTeams.filter((t) => !t.archived_at);

  const matchQueries = useQueries({
    queries: (isTD ? activeTeamsTD : []).map((team) => ({
      queryKey: ["matches", clubId, team.id],
      queryFn: () => listMatches(token!, clubId!, team.id),
      enabled: isTD && !!token && !!clubId,
    })),
  });

  const trainingQueries = useQueries({
    queries: (isTD ? activeTeamsTD : []).map((team) => ({
      queryKey: ["trainings", clubId, team.id],
      queryFn: () => listTrainings(token!, clubId!, team.id),
      enabled: isTD && !!token && !!clubId,
    })),
  });

  // ── TD computed values ──────────────────────────────────────────────────────

  const activeSeason = seasons.find((s) => s.status === "active") ?? null;
  const activePlayerCount = allPlayers.filter((p) => !p.archived_at).length;

  const allScheduledMatches: Array<{ id: number; date: string; opponent_name: string; location: string; teamName: string; teamId: number }> = matchQueries.flatMap((q, idx) =>
    (q.data ?? [])
      .filter((m) => !m.archived_at && m.status === "scheduled")
      .map((m) => ({
        id: m.id,
        date: m.date,
        opponent_name: m.opponent_name,
        location: m.location,
        teamName: activeTeamsTD[idx]?.name ?? "",
        teamId: activeTeamsTD[idx]?.id ?? 0,
      }))
  );
  allScheduledMatches.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const nextMatch = allScheduledMatches[0] ?? null;

  const allTrainings: Array<{ id: number; date: string; title: string; teamName: string; teamId: number }> = trainingQueries.flatMap((q, idx) =>
    (q.data ?? [])
      .filter((t) => !t.archived_at)
      .map((t) => ({
        id: t.id,
        date: t.date,
        title: t.title,
        teamName: activeTeamsTD[idx]?.name ?? "",
        teamId: activeTeamsTD[idx]?.id ?? 0,
      }))
  );
  allTrainings.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const recentTrainings = allTrainings.slice(0, 3);

  const tdLoading = loadingSeasons || loadingTeams || loadingPlayers;
  const matchesLoading = matchQueries.some((q) => q.isLoading);
  const trainingsLoading = trainingQueries.some((q) => q.isLoading);

  // ── Videos query (non-TD) ───────────────────────────────────────────────────

  const { data: videos, isLoading } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(getStoredToken()!),
    enabled: !isTD,
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

  // ── Heading ─────────────────────────────────────────────────────────────────

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

        {!activeProfile && profiles.length === 0 && (
          <Alert className="border-blue-200 bg-blue-50 text-blue-800">
            <Info className="h-4 w-4 shrink-0 text-blue-500" />
            <AlertDescription>
              Tu cuenta está activa. Cuando un club te invite, tus perfiles
              aparecerán aquí. Mientras tanto, puedes usar tu biblioteca
              personal.
            </AlertDescription>
          </Alert>
        )}

        {!activeProfile && profiles.length > 0 && (
          <div>
            <h2 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
              Tus clubs
            </h2>
            <div className="space-y-2">
              {profiles.map((profile) => (
                <div
                  key={profile.id}
                  className="flex items-center justify-between rounded-lg border bg-card p-3"
                >
                  <div>
                    <p className="text-sm font-medium">{profile.club_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {profileLabel(profile)}
                    </p>
                  </div>
                  <button
                    onClick={() => void switchProfile(profile.id)}
                    className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors shrink-0"
                  >
                    Cambiar a este perfil
                  </button>
                </div>
              ))}
            </div>
          </div>
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

        {/* ── TD Dashboard ─────────────────────────────────────────────────── */}
        {isTD && (
          <div className="space-y-4">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Resumen del club
            </h2>

            {/* Stat cards */}
            {tdLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Temporada activa
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    {activeSeason ? (
                      <>
                        <p className="text-sm font-semibold leading-tight">{activeSeason.name}</p>
                        {activeSeason.starts_at && activeSeason.ends_at && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {new Date(activeSeason.starts_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short" })}
                            {" — "}
                            {new Date(activeSeason.ends_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin temporada activa</p>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Equipos activos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-3xl font-bold">{activeTeamsTD.length}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Jugadores activos
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-3xl font-bold">{activePlayerCount}</p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Club
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4">
                    <p className="text-sm font-semibold leading-tight">{activeProfile?.club_name ?? "—"}</p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Próximo partido */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-amber-500" />
                  Próximo partido
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {matchesLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                ) : nextMatch ? (
                  <Link
                    href={`/teams/${nextMatch.teamId}/matches/${nextMatch.id}`}
                    className="block hover:underline"
                  >
                    <p className="text-sm font-medium">vs. {nextMatch.opponent_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {nextMatch.teamName}
                      {" · "}
                      {new Date(nextMatch.date).toLocaleDateString("es-ES", {
                        weekday: "short", day: "2-digit", month: "long",
                      })}
                      {" · "}
                      {MATCH_LOCATION_LABELS[nextMatch.location as keyof typeof MATCH_LOCATION_LABELS]}
                    </p>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin partidos programados</p>
                )}
              </CardContent>
            </Card>

            {/* Actividad reciente — últimos entrenamientos */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-blue-500" />
                  Últimos entrenamientos
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {trainingsLoading ? (
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-4 w-48" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    ))}
                  </div>
                ) : recentTrainings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay entrenamientos registrados</p>
                ) : (
                  <div className="divide-y">
                    {recentTrainings.map((t) => (
                      <div key={`${t.teamId}-${t.id}`} className="py-2 first:pt-0 last:pb-0">
                        <Link
                          href={`/teams/${t.teamId}/trainings/${t.id}`}
                          className="block hover:underline"
                        >
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t.teamName}
                            {" · "}
                            {new Date(t.date).toLocaleDateString("es-ES", {
                              day: "2-digit", month: "long", year: "numeric",
                            })}
                          </p>
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Vídeos recientes (non-TD) ─────────────────────────────────────── */}
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
