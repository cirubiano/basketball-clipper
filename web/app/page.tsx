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
  AlertTriangle,
  ClipboardList,
  Trophy,
  Dumbbell,
  BarChart2,
  UserCheck,
  Star,
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
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50",
    },
    {
      href: `/clubs/${clubId}/seasons`,
      icon: CalendarDays,
      label: "Temporadas",
      description: "Administra las temporadas activas",
      color: "text-amber-600 dark:text-amber-400",
      bg: "bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50",
    },
    {
      href: `/players`,
      icon: ClipboardList,
      label: "Jugadores",
      description: "Plantilla de jugadores del club",
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-950/40 hover:bg-green-100 dark:hover:bg-green-900/50",
    },
    {
      href: `/clubs/${clubId}/catalog`,
      icon: LayoutGrid,
      label: "Catálogo",
      description: "Jugadas y ejercicios compartidos",
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50",
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
            color: "text-blue-600 dark:text-blue-400",
            bg: "bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50",
          },
        ]
      : []),
    {
      href: `/clubs/${clubId}/catalog`,
      icon: LayoutGrid,
      label: "Catálogo del club",
      description: "Jugadas y ejercicios compartidos",
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50",
    },
    {
      href: "/drills",
      icon: BookOpen,
      label: "Mi Biblioteca",
      description: "Tus jugadas y ejercicios personales",
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50",
    },
    {
      href: "/upload",
      icon: Upload,
      label: "Subir vídeo",
      description: "Analiza un partido automáticamente",
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50",
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
      color: "text-purple-600 dark:text-purple-400",
      bg: "bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/50",
    },
    {
      href: "/upload",
      icon: Upload,
      label: "Subir vídeo",
      description: "Analiza un partido y genera clips",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50",
    },
  ];
}

export default function DashboardPage() {
  const { user, activeProfile, profiles, token, switchProfile } = useAuth();
  const queryClient = useQueryClient();
  const [toDelete, setToDelete] = useState<VideoListItem | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [calMode, setCalMode] = useState<"month" | "week">("month");
  const [calDate, setCalDate] = useState<Date>(() => {
    const d = new Date();
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
  });

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

  // Coach training query (non-TD with a team)
  const { data: coachTrainings = [] } = useQuery({
    queryKey: ["trainings", clubId, teamId],
    queryFn: () => listTrainings(token!, clubId!, teamId!),
    enabled: !isTD && !!token && !!clubId && !!teamId,
  });

  // #9 — Coach match query (non-TD with a team)
  const { data: coachMatches = [] } = useQuery({
    queryKey: ["matches", clubId, teamId],
    queryFn: () => listMatches(token!, clubId!, teamId!),
    enabled: !isTD && !!token && !!clubId && !!teamId,
  });

  // ── TD computed values ──────────────────────────────────────────────────────

  // #9 — Coach computed values
  const nowMs = Date.now();
  const nextCoachMatch = coachMatches
    .filter((m) => m.status === "scheduled" && new Date(m.date).getTime() >= nowMs)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;
  const nextCoachTraining = coachTrainings
    .filter((t) => !t.archived_at && new Date(t.date).getTime() >= nowMs)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0] ?? null;

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

  // Build unified calendar training list
  const calendarTrainings: Array<{ id: number; date: string; title: string; teamId: number; teamName: string }> =
    isTD
      ? allTrainings
      : coachTrainings
          .filter((t) => !t.archived_at)
          .map((t) => ({
            id: t.id,
            date: t.date,
            title: t.title,
            teamId: teamId ?? 0,
            teamName: activeProfile?.team_name ?? "",
          }));

  // Group calendar trainings by "YYYY-MM-DD"
  const trainingsByDay = new Map<string, Array<{ id: number; teamId: number; title: string; teamName: string }>>();
  for (const t of calendarTrainings) {
    const key = t.date.slice(0, 10);
    const list = trainingsByDay.get(key) ?? [];
    list.push({ id: t.id, teamId: t.teamId, title: t.title, teamName: t.teamName });
    trainingsByDay.set(key, list);
  }

  // Next upcoming training per team (for RF-502)
  const now = new Date();
  const upcomingByTeam: Array<{ id: number; date: string; title: string; teamId: number; teamName: string }> = [];
  const seenTeams = new Set<number>();
  [...calendarTrainings]
    .filter((t) => new Date(t.date) >= now)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .forEach((t) => {
      if (!seenTeams.has(t.teamId)) {
        seenTeams.add(t.teamId);
        upcomingByTeam.push(t);
      }
    });

  const calendarLoading = isTD ? trainingQueries.some((q) => q.isLoading) : false;

  const tdLoading = loadingSeasons || loadingTeams || loadingPlayers;
  const matchesLoading = matchQueries.some((q) => q.isLoading);
  const trainingsLoading = trainingQueries.some((q) => q.isLoading);

  // ── Sección 1: Stats por equipo ──────────────────────────────────────────────
  const teamStats = activeTeamsTD.map((team, idx) => {
    const q = matchQueries[idx];
    const finished = (q?.data ?? []).filter((m) => m.status === "finished" && !m.archived_at);
    const played = finished.length;
    const wins = finished.filter((m) => (m.our_score ?? -1) > (m.their_score ?? -2)).length;
    const losses = finished.filter((m) => (m.our_score ?? -1) < (m.their_score ?? -2)).length;
    const avgOur = played > 0
      ? finished.reduce((s, m) => s + (m.our_score ?? 0), 0) / played
      : null;
    const avgTheir = played > 0
      ? finished.reduce((s, m) => s + (m.their_score ?? 0), 0) / played
      : null;
    return { team, isError: q?.isError ?? false, played, wins, losses, avgOur, avgTheir };
  });

  // ── Sección 2: Resumen de asistencia ────────────────────────────────────────
  const attendanceSummaries = activeTeamsTD.map((team, idx) => {
    const q = trainingQueries[idx];
    const trainings = (q?.data ?? []).filter((t) => !t.archived_at);
    const totalTrainings = trainings.length;

    const playerMap = new Map<number, { name: string; present: number; total: number }>();
    trainings.forEach((tr) => {
      tr.training_attendances.forEach((att) => {
        const name =
          [att.player_first_name, att.player_last_name].filter(Boolean).join(" ") ||
          `Jugador #${att.player_id}`;
        const prev = playerMap.get(att.player_id) ?? { name, present: 0, total: 0 };
        playerMap.set(att.player_id, {
          name: prev.name,
          present: prev.present + (att.attended ? 1 : 0),
          total: prev.total + 1,
        });
      });
    });

    const allPlayerStats = Array.from(playerMap.values());
    const avgPct =
      allPlayerStats.length > 0
        ? allPlayerStats.reduce(
            (s, p) => s + (p.total > 0 ? (p.present / p.total) * 100 : 0),
            0,
          ) / allPlayerStats.length
        : null;

    const bottom3 = allPlayerStats
      .map((p) => ({ ...p, pct: p.total > 0 ? Math.round((p.present / p.total) * 100) : 0 }))
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 3);

    return { team, isError: q?.isError ?? false, totalTrainings, avgPct, bottom3 };
  });

  // ── Sección 3: Top performers ────────────────────────────────────────────────
  const playerTotalsMap = new Map<number, { name: string; points: number; assists: number; rebounds: number }>();
  matchQueries.forEach((q) => {
    (q.data ?? [])
      .filter((m) => m.status === "finished" && !m.archived_at)
      .forEach((m) => {
        const nameOf = (pid: number) => {
          const mp = m.match_players.find((p) => p.player_id === pid);
          return mp
            ? [mp.player_first_name, mp.player_last_name].filter(Boolean).join(" ") ||
                `Jugador #${pid}`
            : `Jugador #${pid}`;
        };
        m.match_stats.forEach((s) => {
          const prev = playerTotalsMap.get(s.player_id) ?? {
            name: nameOf(s.player_id),
            points: 0,
            assists: 0,
            rebounds: 0,
          };
          playerTotalsMap.set(s.player_id, {
            name: prev.name,
            points: prev.points + (s.points ?? 0),
            assists: prev.assists + (s.assists ?? 0),
            rebounds: prev.rebounds + (s.defensive_rebounds ?? 0) + (s.offensive_rebounds ?? 0),
          });
        });
      });
  });
  const allPlayerTotals = Array.from(playerTotalsMap.values());
  const topScorer = allPlayerTotals.length > 0
    ? allPlayerTotals.reduce((a, b) => (a.points >= b.points ? a : b))
    : null;
  const topAssist = allPlayerTotals.length > 0
    ? allPlayerTotals.reduce((a, b) => (a.assists >= b.assists ? a : b))
    : null;
  const topRebounder = allPlayerTotals.length > 0
    ? allPlayerTotals.reduce((a, b) => (a.rebounds >= b.rebounds ? a : b))
    : null;
  const hasTopStats =
    (topScorer?.points ?? 0) > 0 ||
    (topAssist?.assists ?? 0) > 0 ||
    (topRebounder?.rebounds ?? 0) > 0;

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

        {/* ── #8 Panel de alertas accionables ────────────────────────────── */}
        {isTD && !tdLoading && (
          <div className="space-y-2">
            {/* Alerta: sin temporada activa */}
            {activeSeason === null && (
              <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                <AlertDescription className="flex items-center justify-between gap-3">
                  <span className="text-amber-800 dark:text-amber-200 text-sm">
                    No hay ninguna temporada activa. Sin temporada activa no se pueden registrar partidos ni entrenamientos.
                  </span>
                  <a
                    href={clubId ? `/clubs/${clubId}/seasons` : "#"}
                    className="shrink-0 text-xs font-medium text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-100"
                  >
                    Gestionar
                  </a>
                </AlertDescription>
              </Alert>
            )}
            {/* Alerta: partido inminente (próximos 7 días) */}
            {nextMatch && (() => {
              const daysUntil = Math.ceil((new Date(nextMatch.date).getTime() - Date.now()) / 86400000);
              return daysUntil >= 0 && daysUntil <= 7 ? (
                <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40">
                  <Info className="h-4 w-4 shrink-0 text-blue-600" />
                  <AlertDescription className="flex items-center justify-between gap-3">
                    <span className="text-blue-800 dark:text-blue-200 text-sm">
                      {daysUntil === 0
                        ? `Partido hoy vs. ${nextMatch.opponent_name} (${nextMatch.teamName})`
                        : daysUntil === 1
                        ? `Partido mañana vs. ${nextMatch.opponent_name} (${nextMatch.teamName})`
                        : `Partido en ${daysUntil} días vs. ${nextMatch.opponent_name} (${nextMatch.teamName})`}
                    </span>
                    <a
                      href={`/teams/${nextMatch.teamId}/matches/${nextMatch.id}`}
                      className="shrink-0 text-xs font-medium text-blue-700 dark:text-blue-300 underline underline-offset-2 hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      Ver partido
                    </a>
                  </AlertDescription>
                </Alert>
              ) : null;
            })()}
          </div>
        )}

                {!activeProfile && profiles.length === 0 && (
          <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-200">
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

        {/* ── Training calendar (RF-500–503) ──────────────────────────────── */}
        {!!activeProfile && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-medium text-muted-foreground mb-0 uppercase tracking-wide flex items-center gap-1.5">
                <CalendarDays className="h-3.5 w-3.5" />
                Calendario de entrenamientos
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCalMode("month")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded border transition-colors",
                    calMode === "month"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Mes
                </button>
                <button
                  onClick={() => setCalMode("week")}
                  className={cn(
                    "px-2.5 py-1 text-xs rounded border transition-colors",
                    calMode === "week"
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  Semana
                </button>
              </div>
            </div>
            <TrainingCalendar
              mode={calMode}
              currentDate={calDate}
              trainingsByDay={trainingsByDay}
              isLoading={calendarLoading}
              onNavigate={setCalDate}
            />
            {/* Next training per team (RF-502) */}
            {upcomingByTeam.length > 0 && (
              <div className="mt-3 border rounded-lg divide-y">
                {upcomingByTeam.map((t) => (
                  <Link
                    key={`${t.teamId}-${t.id}`}
                    href={`/teams/${t.teamId}/trainings/${t.id}`}
                    className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors"
                  >
                    <div>
                      <p className="text-sm font-medium">{t.teamName}</p>
                      <p className="text-xs text-muted-foreground">{t.title}</p>
                    </div>
                    <p className="text-xs text-muted-foreground shrink-0 ml-4">
                      {new Date(t.date).toLocaleDateString("es-ES", {
                        weekday: "short", day: "2-digit", month: "short",
                      })}
                      {" · "}
                      {new Date(t.date).toLocaleTimeString("es-ES", {
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

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
            {/* Sección 1 — Estadísticas por equipo */}
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <BarChart2 className="h-3.5 w-3.5" />
                Estadísticas — temporada actual
              </h2>
              {matchesLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: Math.max(activeTeamsTD.length, 1) }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {teamStats.map(({ team, isError, played, wins, losses, avgOur, avgTheir }) => (
                    <Card key={team.id}>
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-sm font-semibold">{team.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        {isError ? (
                          <p className="text-xs text-destructive">Error al cargar los datos.</p>
                        ) : played === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin partidos jugados esta temporada.</p>
                        ) : (
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                            <span className="text-muted-foreground">Jugados</span>
                            <span className="font-medium">{played}</span>
                            <span className="text-muted-foreground">Victorias / Derrotas</span>
                            <span className="font-medium">{wins} / {losses}</span>
                            {avgOur !== null && avgTheir !== null && (
                              <>
                                <span className="text-muted-foreground">Pts anotados / encajados</span>
                                <span className="font-medium">
                                  {avgOur.toFixed(1)} / {avgTheir.toFixed(1)}
                                </span>
                              </>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Sección 2 — Resumen de asistencia */}
            <div className="space-y-3">
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <UserCheck className="h-3.5 w-3.5" />
                Asistencia a entrenamientos
              </h2>
              {trainingsLoading ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {Array.from({ length: Math.max(activeTeamsTD.length, 1) }).map((_, i) => (
                    <Skeleton key={i} className="h-28 rounded-lg" />
                  ))}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {attendanceSummaries.map(({ team, isError, totalTrainings, avgPct, bottom3 }) => (
                    <Card key={team.id}>
                      <CardHeader className="pb-1 pt-3 px-4">
                        <CardTitle className="text-sm font-semibold">{team.name}</CardTitle>
                      </CardHeader>
                      <CardContent className="px-4 pb-3">
                        {isError ? (
                          <p className="text-xs text-destructive">Error al cargar los datos.</p>
                        ) : totalTrainings === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin entrenamientos registrados.</p>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="grid grid-cols-2 gap-x-4 text-xs">
                              <span className="text-muted-foreground">Entrenamientos</span>
                              <span className="font-medium">{totalTrainings}</span>
                              {avgPct !== null && (
                                <>
                                  <span className="text-muted-foreground">Asistencia media</span>
                                  <span className="font-medium">{Math.round(avgPct)}%</span>
                                </>
                              )}
                            </div>
                            {bottom3.length > 0 && (
                              <div className="pt-1 border-t">
                                <p className="text-xs text-muted-foreground mb-1">Menor asistencia</p>
                                {bottom3.map((p, i) => (
                                  <div key={i} className="flex justify-between text-xs">
                                    <span className="truncate max-w-[60%]">{p.name}</span>
                                    <span className={cn(
                                      "font-medium shrink-0",
                                      p.pct >= 80 ? "text-green-600 dark:text-green-400" : p.pct >= 60 ? "text-amber-600 dark:text-amber-400" : "text-destructive",
                                    )}>
                                      {p.pct}%
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Sección 3 — Top performers */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Star className="h-4 w-4 text-amber-400" />
                  Top jugadores — temporada actual
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                {matchesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-4 w-64" />
                    ))}
                  </div>
                ) : !hasTopStats ? (
                  <p className="text-sm text-muted-foreground">
                    Sin estadísticas registradas esta temporada.
                  </p>
                ) : (
                  <div className="divide-y">
                    {topScorer && topScorer.points > 0 && (
                      <div className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Máximo anotador</p>
                          <p className="text-sm font-medium">{topScorer.name}</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">
                          {topScorer.points} pts
                        </span>
                      </div>
                    )}
                    {topAssist && topAssist.assists > 0 && (
                      <div className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Máximo asistente</p>
                          <p className="text-sm font-medium">{topAssist.name}</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">
                          {topAssist.assists} ast
                        </span>
                      </div>
                    )}
                    {topRebounder && topRebounder.rebounds > 0 && (
                      <div className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-xs text-muted-foreground">Máximo reboteador</p>
                          <p className="text-sm font-medium">{topRebounder.name}</p>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">
                          {topRebounder.rebounds} reb
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── #9 Coach overview: próximo partido + entrenamiento ─────────────── */}
        {!isTD && role === "head_coach" && teamId && (
          <div className="space-y-4">
            {/* #7 — Mini-calendario semanal */}
            <div>
              <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5 mb-2">
                <CalendarDays className="h-3.5 w-3.5" />
                Esta semana
              </h2>
              <WeekStrip
                matches={coachMatches}
                trainings={coachTrainings}
                teamId={teamId}
              />
            </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Próximo partido */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Trophy className="h-4 w-4 text-muted-foreground" />
                  Próximo partido
                </CardTitle>
              </CardHeader>
              <CardContent>
                {nextCoachMatch ? (
                  <Link
                    href={`/teams/${teamId}/matches/${nextCoachMatch.id}`}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <p className="font-semibold text-base truncate">vs. {nextCoachMatch.opponent_name}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(nextCoachMatch.date).toLocaleDateString("es-ES", { weekday: "short", month: "short", day: "numeric" })}
                      {" · "}
                      {new Date(nextCoachMatch.date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {MATCH_LOCATION_LABELS[nextCoachMatch.location as keyof typeof MATCH_LOCATION_LABELS]}
                    </p>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay partidos programados.</p>
                )}
              </CardContent>
            </Card>

            {/* Próximo entrenamiento */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Dumbbell className="h-4 w-4 text-muted-foreground" />
                  Próximo entrenamiento
                </CardTitle>
              </CardHeader>
              <CardContent>
                {nextCoachTraining ? (
                  <Link
                    href={`/teams/${teamId}/trainings/${nextCoachTraining.id}`}
                    className="block hover:opacity-80 transition-opacity"
                  >
                    <p className="font-semibold text-base truncate">
                      {nextCoachTraining.title ?? "Entrenamiento"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {new Date(nextCoachTraining.date).toLocaleDateString("es-ES", { weekday: "short", month: "short", day: "numeric" })}
                    </p>
                  </Link>
                ) : (
                  <p className="text-sm text-muted-foreground">No hay entrenamientos programados.</p>
                )}
              </CardContent>
            </Card>
          </div>
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

// ── TrainingCalendar ──────────────────────────────────────────────────────────

import { useRouter } from "next/navigation";

function TrainingCalendar({
  mode,
  currentDate,
  trainingsByDay,
  isLoading,
  onNavigate,
}: {
  mode: "month" | "week";
  currentDate: Date;
  trainingsByDay: Map<string, Array<{ id: number; teamId: number; title: string; teamName: string }>>;
  isLoading: boolean;
  onNavigate: (d: Date) => void;
}) {
  const router = useRouter();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Compute the cells to render
  function getMonthCells(base: Date): Date[] {
    const year = base.getFullYear();
    const month = base.getMonth();
    const firstDay = new Date(year, month, 1);
    // ISO week: Monday=0
    const startOffset = (firstDay.getDay() + 6) % 7;
    const cells: Date[] = [];
    for (let i = -startOffset; i < 42 - startOffset; i++) {
      cells.push(new Date(year, month, 1 + i));
    }
    return cells;
  }

  function getWeekCells(base: Date): Date[] {
    const d = new Date(base);
    const dow = (d.getDay() + 6) % 7; // Mon=0
    d.setDate(d.getDate() - dow);
    return Array.from({ length: 7 }, (_, i) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + i));
  }

  const cells = mode === "month" ? getMonthCells(currentDate) : getWeekCells(currentDate);

  function navigate(dir: -1 | 1) {
    const next = new Date(currentDate);
    if (mode === "month") {
      next.setMonth(next.getMonth() + dir);
    } else {
      next.setDate(next.getDate() + dir * 7);
    }
    next.setDate(1);
    if (mode === "week") next.setDate(currentDate.getDate() + dir * 7);
    onNavigate(next);
  }

  const WEEKDAYS = ["L", "M", "X", "J", "V", "S", "D"];

  const label =
    mode === "month"
      ? currentDate.toLocaleDateString("es-ES", { month: "long", year: "numeric" })
      : (() => {
          const wCells = getWeekCells(currentDate);
          const s = wCells[0].toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
          const e = wCells[6].toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
          return `${s} – ${e}`;
        })();

  const curMonth = currentDate.getMonth();

  function handleDayClick(date: Date) {
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dayTrainings = trainingsByDay.get(key);
    if (dayTrainings && dayTrainings.length > 0) {
      router.push(`/teams/${dayTrainings[0].teamId}/trainings/${dayTrainings[0].id}`);
    }
  }

  if (isLoading) {
    return <div className="border rounded-lg p-4"><Skeleton className="h-48 w-full" /></div>;
  }

  return (
    <div className="border rounded-lg p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Anterior"
        >
          ‹
        </button>
        <span className="text-sm font-medium capitalize">{label}</span>
        <button
          onClick={() => navigate(1)}
          className="p-1 rounded hover:bg-muted transition-colors text-muted-foreground"
          aria-label="Siguiente"
        >
          ›
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground font-medium py-1">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className={cn("grid grid-cols-7", mode === "week" ? "gap-1" : "")}>
        {cells.map((date, idx) => {
          const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
          const hasTraining = trainingsByDay.has(key);
          const isToday = date.getTime() === today.getTime();
          const isCurrentMonth = mode === "week" || date.getMonth() === curMonth;

          return (
            <button
              key={idx}
              onClick={() => handleDayClick(date)}
              disabled={!hasTraining}
              className={cn(
                "relative flex flex-col items-center justify-center rounded py-1.5 text-xs transition-colors",
                isToday && "font-bold",
                !isCurrentMonth && "text-muted-foreground/40",
                hasTraining && "cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-950",
                !hasTraining && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "h-6 w-6 flex items-center justify-center rounded-full text-xs",
                  isToday && "bg-foreground text-background",
                )}
              >
                {date.getDate()}
              </span>
              {hasTraining && (
                <span className="absolute bottom-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}


// ── WeekStrip — #7 Mini-calendario semanal de eventos ────────────────────────
// Shows a 7-day horizontal strip (Mon–Sun) with color-coded event dots for
// matches (primary) and trainings (amber). Used in the HeadCoach dashboard.

interface WeekEvent {
  id: number;
  type: "match" | "training";
  label: string;
  href: string;
  time: string;
}

function WeekStrip({
  matches,
  trainings,
  teamId,
}: {
  matches: Array<{ id: number; date: string; opponent_name: string }>;
  trainings: Array<{ id: number; date: string; title: string }>;
  teamId: number;
}) {
  // Build current week Mon–Sun
  const today = new Date();
  const dow = today.getDay(); // 0=Sun
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((dow + 6) % 7));

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });

  // Build event map keyed by YYYY-MM-DD (local)
  const eventsByDay = new Map<string, WeekEvent[]>();
  days.forEach((d) => eventsByDay.set(d.toLocaleDateString("sv"), []));

  matches.forEach((m) => {
    const key = new Date(m.date).toLocaleDateString("sv");
    if (eventsByDay.has(key)) {
      eventsByDay.get(key)!.push({
        id: m.id,
        type: "match",
        label: `vs. ${m.opponent_name}`,
        href: `/teams/${teamId}/matches/${m.id}`,
        time: new Date(m.date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  });

  trainings.forEach((t) => {
    const key = new Date(t.date).toLocaleDateString("sv");
    if (eventsByDay.has(key)) {
      eventsByDay.get(key)!.push({
        id: t.id,
        type: "training",
        label: t.title,
        href: `/teams/${teamId}/trainings/${t.id}`,
        time: new Date(t.date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }),
      });
    }
  });

  const todayKey = today.toLocaleDateString("sv");
  const DAY_LABELS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const key = d.toLocaleDateString("sv");
          const events = eventsByDay.get(key) ?? [];
          const isToday = key === todayKey;
          const isPast = d < today && !isToday;

          return (
            <div
              key={key}
              className={cn(
                "flex flex-col items-center py-2 px-1 border-r last:border-r-0 min-h-[80px]",
                isToday && "bg-primary/5",
                isPast && "opacity-50",
              )}
            >
              {/* Day label */}
              <span className={cn("text-[10px] font-medium mb-1 uppercase tracking-wide", isToday ? "text-primary" : "text-muted-foreground")}>
                {DAY_LABELS[i]}
              </span>
              {/* Day number */}
              <span className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold mb-2",
                isToday ? "bg-primary text-primary-foreground" : "text-foreground",
              )}>
                {d.getDate()}
              </span>
              {/* Events */}
              <div className="flex flex-col gap-1 w-full px-0.5">
                {events.map((ev) => (
                  <Link
                    key={`${ev.type}-${ev.id}`}
                    href={ev.href}
                    title={`${ev.label} · ${ev.time}`}
                    className={cn(
                      "block w-full rounded px-1 py-0.5 text-[9px] font-medium leading-tight truncate transition-opacity hover:opacity-80",
                      ev.type === "match"
                        ? "bg-primary/15 text-primary"
                        : "bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200",
                    )}
                  >
                    {ev.time}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div className="flex items-center gap-4 px-3 py-1.5 border-t bg-muted/30">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-sm bg-primary/40" />
          Partido
        </span>
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="inline-block h-2 w-2 rounded-sm bg-amber-400" />
          Entrenamiento
        </span>
      </div>
    </div>
  );
}
