"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Film, Play, CheckCircle, XCircle, Upload } from "lucide-react";
import Link from "next/link";
import {
  getMatch,
  addMatchPlayer,
  removeMatchPlayer,
  upsertMatchStat,
  updateMatch,
  startMatch,
  finishMatch,
  cancelMatch,
  addMatchVideo,
  removeMatchVideo,
  listRoster,
  listVideos,
} from "@basketball-clipper/shared/api";
import {
  MATCH_LOCATION_LABELS,
  MATCH_STATUS_LABELS,
  MATCH_VIDEO_LABEL_LABELS,
} from "@basketball-clipper/shared/types";
import type {
  MatchStatUpsert,
  MatchStatus,
  MatchVideoLabel,
} from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function statusBadgeClass(status: MatchStatus): string {
  switch (status) {
    case "scheduled":   return "bg-secondary text-secondary-foreground";
    case "in_progress": return "bg-green-500 text-white animate-pulse";
    case "finished":    return "bg-blue-600 text-white";
    case "cancelled":   return "bg-destructive text-destructive-foreground line-through";
  }
}

type TabKey = "convocatoria" | "videos" | "estadisticas";

export default function MatchDetailPage({
  params,
}: {
  params: { teamId: string; matchId: string };
}) {
  const teamId = Number(params.teamId);
  const matchId = Number(params.matchId);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clubId = activeProfile?.club_id;
  const isCoachOrTD =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const [tab, setTab] = useState<TabKey>("convocatoria");
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [selectedVideoLabel, setSelectedVideoLabel] = useState<MatchVideoLabel>("other");
  const [scoreDialogOpen, setScoreDialogOpen] = useState(false);
  const [scoreForm, setScoreForm] = useState({ our: "", their: "" });

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatch(token!, clubId!, teamId, matchId),
    enabled: !!token && !!clubId,
  });

  // Roster for convocatoria selector
  const { data: roster = [] } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  // Videos for linking
  const { data: videos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(token!),
    enabled: !!token,
  });

  const completedVideos = videos.filter((v) => v.status === "completed");
  const linkedVideoIds = new Set(match?.match_videos.map((mv) => mv.video_id) ?? []);
  const availableVideos = completedVideos.filter((v) => !linkedVideoIds.has(v.id));

  // ── Transiciones de estado ──────────────────────────────────────────────────

  const startMut = useMutation({
    mutationFn: () => startMatch(token!, clubId!, teamId, matchId),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} iniciado.`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const finishMut = useMutation({
    mutationFn: () => finishMatch(token!, clubId!, teamId, matchId),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} finalizado.`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const cancelMut = useMutation({
    mutationFn: () => cancelMatch(token!, clubId!, teamId, matchId),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} cancelado.`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // ── Otras mutaciones ────────────────────────────────────────────────────────

  const addVideoMut = useMutation({
    mutationFn: () =>
      addMatchVideo(token!, clubId!, teamId, matchId, {
        video_id: Number(selectedVideoId),
        label: selectedVideoLabel,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      setSelectedVideoId("");
      setSelectedVideoLabel("other");
      toast("Vídeo vinculado al partido.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const removeVideoMut = useMutation({
    mutationFn: (videoId: number) =>
      removeMatchVideo(token!, clubId!, teamId, matchId, videoId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Vídeo desvinculado.");
    },
  });

  const saveScoreMut = useMutation({
    mutationFn: () =>
      updateMatch(token!, clubId!, teamId, matchId, {
        our_score: scoreForm.our === "" ? null : Number(scoreForm.our),
        their_score: scoreForm.their === "" ? null : Number(scoreForm.their),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      setScoreDialogOpen(false);
      toast("Resultado guardado.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Sync score form when dialog opens
  useEffect(() => {
    if (scoreDialogOpen && match) {
      setScoreForm({
        our: match.our_score != null ? String(match.our_score) : "",
        their: match.their_score != null ? String(match.their_score) : "",
      });
    }
  }, [scoreDialogOpen, match]);

  const addPlayerMut = useMutation({
    mutationFn: (playerId: number) =>
      addMatchPlayer(token!, clubId!, teamId, matchId, playerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Jugador añadido a la convocatoria.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const removePlayerMut = useMutation({
    mutationFn: (playerId: number) =>
      removeMatchPlayer(token!, clubId!, teamId, matchId, playerId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Jugador retirado de la convocatoria.");
    },
  });

  const upsertStatMut = useMutation({
    mutationFn: (data: MatchStatUpsert) =>
      upsertMatchStat(token!, clubId!, teamId, matchId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
    },
  });

  if (isLoading) {
    return (
      <PageShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </PageShell>
    );
  }

  if (!match) {
    return (
      <PageShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl text-center text-muted-foreground">
          <p>Partido no encontrado.</p>
          <Button asChild variant="link">
            <Link href={`/teams/${teamId}/matches`}>Volver</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const convocadoIds = new Set(match.match_players.map((mp) => mp.player_id));
  const notConvocado = roster.filter((re) => !convocadoIds.has(re.player_id) && !re.archived_at);

  const dateStr = new Date(match.date).toLocaleDateString("es-ES", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = new Date(match.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  const matchDatePassed = new Date(match.date) <= new Date();
  const isTransitioning = startMut.isPending || finishMut.isPending || cancelMut.isPending;

  const showScore = match.status === "in_progress" || match.status === "finished";

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Breadcrumb
            className="mb-4"
            items={[
              { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
              { label: activeProfile?.team_name ?? "Equipo", href: `/teams/${teamId}/matches` },
              { label: "Partidos", href: `/teams/${teamId}/matches` },
              { label: `vs. ${match.opponent_name}` },
            ]}
          />
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">vs. {match.opponent_name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {dateStr} · {timeStr} · {MATCH_LOCATION_LABELS[match.location]}
              </p>
            </div>

            {/* Estado + botones de transición */}
            <div className="flex flex-col items-end gap-2 shrink-0">
              <Badge className={statusBadgeClass(match.status)}>
                {MATCH_STATUS_LABELS[match.status]}
              </Badge>

              {isCoachOrTD && match.status === "scheduled" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={!matchDatePassed || isTransitioning}
                    title={!matchDatePassed ? "El partido aún no ha comenzado" : undefined}
                    onClick={() => startMut.mutate()}
                  >
                    <Play className="h-3 w-3" />
                    Iniciar partido
                  </Button>
                  <CancelMatchDialog
                    opponentName={match.opponent_name}
                    disabled={isTransitioning}
                    onConfirm={() => cancelMut.mutate()}
                  />
                </div>
              )}

              {isCoachOrTD && match.status === "in_progress" && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={isTransitioning}
                    onClick={() => finishMut.mutate()}
                  >
                    <CheckCircle className="h-3 w-3" />
                    Finalizar partido
                  </Button>
                  <CancelMatchDialog
                    opponentName={match.opponent_name}
                    disabled={isTransitioning}
                    onConfirm={() => cancelMut.mutate()}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Score (during in_progress and after finished) */}
          {showScore && (
            <div className="mt-3 flex items-center gap-3">
              {match.our_score != null && match.their_score != null ? (
                <span className="text-3xl font-bold tabular-nums">
                  {match.our_score} <span className="text-muted-foreground">—</span> {match.their_score}
                </span>
              ) : (
                <span className="text-xl font-medium text-muted-foreground">— — —</span>
              )}
              {isCoachOrTD && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setScoreDialogOpen(true)}
                >
                  {match.our_score != null ? "Editar resultado" : "Añadir resultado"}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-6">
          {(["convocatoria", "videos", "estadisticas"] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "convocatoria" && "Convocatoria"}
              {t === "videos" && "Vídeos"}
              {t === "estadisticas" && "Estadísticas"}
            </button>
          ))}
        </div>

        {/* Tab: Convocatoria */}
        {tab === "convocatoria" && (
          <div>
            {match.match_players.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                No hay jugadores convocados.
              </div>
            ) : (
              <div className="border rounded-lg divide-y mb-4">
                {match.match_players.map((mp) => (
                  <div key={mp.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                      {(mp.player_first_name?.[0] ?? "").toUpperCase()}{(mp.player_last_name?.[0] ?? "").toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {mp.player_first_name} {mp.player_last_name}
                      </p>
                    </div>
                    {isCoachOrTD && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={removePlayerMut.isPending}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Retirar jugador?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se retirará a <strong>{mp.player_first_name} {mp.player_last_name}</strong> de la convocatoria.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => removePlayerMut.mutate(mp.player_id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Retirar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isCoachOrTD && notConvocado.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-medium text-muted-foreground">Añadir a la convocatoria</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={addPlayerMut.isPending}
                    onClick={() => notConvocado.forEach((re) => addPlayerMut.mutate(re.player_id))}
                  >
                    <UserPlus className="h-3 w-3" />
                    Convocar a todos
                  </Button>
                </div>
                <div className="border rounded-lg divide-y">
                  {notConvocado.map((re) => (
                    <div key={re.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                        {(re.player.first_name?.[0] ?? "").toUpperCase()}{(re.player.last_name?.[0] ?? "").toUpperCase()}
                      </div>
                      <p className="text-sm flex-1">{re.player.first_name} {re.player.last_name}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1"
                        disabled={addPlayerMut.isPending}
                        onClick={() => addPlayerMut.mutate(re.player_id)}
                      >
                        <UserPlus className="h-3 w-3" />
                        Añadir
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Vídeos */}
        {tab === "videos" && (
          <div className="space-y-4">
            {match.match_videos.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                No hay vídeos vinculados a este partido.
              </div>
            ) : (
              <div className="border rounded-lg divide-y">
                {match.match_videos.map((mv) => (
                  <div key={mv.id} className="flex items-center gap-3 px-4 py-3">
                    <Film className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mv.video_title ?? `Vídeo #${mv.video_id}`}</p>
                      <p className="text-xs text-muted-foreground">{MATCH_VIDEO_LABEL_LABELS[mv.label]}</p>
                    </div>
                    {isCoachOrTD && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                        disabled={removeVideoMut.isPending}
                        onClick={() => removeVideoMut.mutate(mv.video_id)}
                        aria-label="Desvincular vídeo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {isCoachOrTD && (
              <div className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Vincular vídeo</p>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                  >
                    <Link
                      href={`/upload?returnTo=/teams/${teamId}/matches/${matchId}&opponent=${encodeURIComponent(match.opponent_name)}`}
                    >
                      <Upload className="h-3 w-3" />
                      Subir vídeo
                    </Link>
                  </Button>
                </div>
                {availableVideos.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay vídeos procesados disponibles. Usa el botón{" "}
                    <strong>Subir vídeo</strong> para subir uno nuevo.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-2 items-end">
                    <div className="flex-1 min-w-40 space-y-1">
                      <Label className="text-xs">Vídeo</Label>
                      <Select value={selectedVideoId} onValueChange={setSelectedVideoId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecciona un vídeo..." />
                        </SelectTrigger>
                        <SelectContent>
                          {availableVideos.map((v) => (
                            <SelectItem key={v.id} value={String(v.id)}>
                              {v.title ?? `Vídeo #${v.id}`}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Etiqueta</Label>
                      <Select value={selectedVideoLabel} onValueChange={(v) => setSelectedVideoLabel(v as MatchVideoLabel)}>
                        <SelectTrigger className="h-8 text-xs w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="scouting">Scouting</SelectItem>
                          <SelectItem value="post_analysis">Análisis post-partido</SelectItem>
                          <SelectItem value="other">Otro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!selectedVideoId || addVideoMut.isPending}
                      onClick={() => addVideoMut.mutate()}
                    >
                      Vincular
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab: Estadísticas */}
        {tab === "estadisticas" && (
          <div>
            {match.status === "scheduled" && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                Las estadísticas se pueden registrar una vez iniciado el partido.
              </div>
            )}
            {match.status === "cancelled" && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                El partido fue cancelado — no hay estadísticas disponibles.
              </div>
            )}
            {(match.status === "in_progress" || match.status === "finished") && (
              match.match_players.length === 0 ? (
                <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                  Primero añade jugadores a la convocatoria.
                </div>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/30">
                        <th className="text-left px-4 py-2 font-medium">Jugador</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Min</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Pts</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Reb</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Ast</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Rob</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Pér</th>
                        <th className="text-center px-2 py-2 font-medium w-12">Falt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {match.match_players.map((mp) => {
                        const stat = match.match_stats.find((s) => s.player_id === mp.player_id);
                        return (
                          <StatRow
                            key={stat ? `stat-${stat.id}` : `nostat-${mp.player_id}`}
                            playerId={mp.player_id}
                            name={`${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim()}
                            stat={stat}
                            editable={isCoachOrTD && match.status === "in_progress"}
                            onSave={(data) => upsertStatMut.mutate(data)}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                  {match.status === "finished" && (
                    <p className="text-xs text-muted-foreground text-center py-2 border-t">
                      Partido finalizado — estadísticas en modo lectura.
                    </p>
                  )}
                </div>
              )
            )}
          </div>
        )}
      </div>

      {/* Score dialog */}
      <Dialog open={scoreDialogOpen} onOpenChange={setScoreDialogOpen}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Resultado del partido</DialogTitle>
          </DialogHeader>
          <div className="flex items-center gap-3 py-2">
            <div className="flex-1 space-y-1">
              <Label htmlFor="our-score" className="text-xs">Nuestros puntos</Label>
              <Input
                id="our-score"
                type="number"
                min={0}
                className="text-center h-10 text-lg"
                value={scoreForm.our}
                onChange={(e) => setScoreForm((f) => ({ ...f, our: e.target.value }))}
                placeholder="—"
              />
            </div>
            <span className="text-muted-foreground font-bold text-xl mt-5">—</span>
            <div className="flex-1 space-y-1">
              <Label htmlFor="their-score" className="text-xs">Puntos rival</Label>
              <Input
                id="their-score"
                type="number"
                min={0}
                className="text-center h-10 text-lg"
                value={scoreForm.their}
                onChange={(e) => setScoreForm((f) => ({ ...f, their: e.target.value }))}
                placeholder="—"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScoreDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveScoreMut.mutate()} disabled={saveScoreMut.isPending}>
              {saveScoreMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── CancelMatchDialog ─────────────────────────────────────────────────────────

function CancelMatchDialog({
  opponentName,
  disabled,
  onConfirm,
}: {
  opponentName: string;
  disabled: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
          disabled={disabled}
        >
          <XCircle className="h-3 w-3" />
          Cancelar partido
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cancelar partido?</AlertDialogTitle>
          <AlertDialogDescription>
            El partido vs. <strong>{opponentName}</strong> quedará marcado como cancelado.
            Esta acción no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Cancelar partido
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── StatRow ───────────────────────────────────────────────────────────────────

function StatRow({
  playerId,
  name,
  stat,
  editable,
  onSave,
}: {
  playerId: number;
  name: string;
  stat: { points: number | null; minutes: number | null; assists: number | null; defensive_rebounds: number | null; offensive_rebounds: number | null; steals: number | null; turnovers: number | null; fouls: number | null } | undefined;
  editable: boolean;
  onSave: (data: MatchStatUpsert) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    minutes: String(stat?.minutes ?? ""),
    points: String(stat?.points ?? ""),
    defensive_rebounds: String(stat?.defensive_rebounds ?? ""),
    offensive_rebounds: String(stat?.offensive_rebounds ?? ""),
    assists: String(stat?.assists ?? ""),
    steals: String(stat?.steals ?? ""),
    turnovers: String(stat?.turnovers ?? ""),
    fouls: String(stat?.fouls ?? ""),
  });

  function toInt(s: string): number | null {
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
  }

  function handleSave() {
    onSave({
      player_id: playerId,
      minutes: toInt(form.minutes),
      points: toInt(form.points),
      defensive_rebounds: toInt(form.defensive_rebounds),
      offensive_rebounds: toInt(form.offensive_rebounds),
      assists: toInt(form.assists),
      steals: toInt(form.steals),
      turnovers: toInt(form.turnovers),
      fouls: toInt(form.fouls),
    });
    setEditing(false);
  }

  const totalReb = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);

  if (editing && editable) {
    return (
      <tr className="border-b bg-accent/5">
        <td className="px-4 py-2 font-medium text-sm" colSpan={8}>
          <div className="flex flex-wrap gap-2 items-end">
            <span className="text-sm font-medium w-full mb-1">{name}</span>
            {(["minutes", "points", "defensive_rebounds", "offensive_rebounds", "assists", "steals", "turnovers", "fouls"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-0.5">
                <Label className="text-xs text-muted-foreground">
                  {key === "minutes" ? "Min" : key === "points" ? "Pts" : key === "defensive_rebounds" ? "RD" : key === "offensive_rebounds" ? "RO" : key === "assists" ? "Ast" : key === "steals" ? "Rob" : key === "turnovers" ? "Pér" : "Falt"}
                </Label>
                <Input
                  className="w-14 h-7 text-xs text-center"
                  type="number"
                  min={0}
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </div>
            ))}
            <Button size="sm" className="h-7 text-xs" onClick={handleSave}>Guardar</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>Cancelar</Button>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      className={cn("border-b hover:bg-muted/30 transition-colors", editable && "cursor-pointer")}
      onClick={() => editable && setEditing(true)}
      title={editable ? "Clic para editar" : undefined}
    >
      <td className="px-4 py-2.5 font-medium">{name}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.minutes ?? "—"}</td>
      <td className="text-center px-2 py-2.5">{stat?.points ?? "—"}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat ? totalReb : "—"}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.assists ?? "—"}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.steals ?? "—"}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.turnovers ?? "—"}</td>
      <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.fouls ?? "—"}</td>
    </tr>
  );
}
