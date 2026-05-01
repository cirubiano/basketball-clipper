"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, UserPlus, Trash2, Film, BarChart2 } from "lucide-react";
import Link from "next/link";
import {
  getMatch,
  addMatchPlayer,
  removeMatchPlayer,
  upsertMatchStat,
  listPlayers,
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
  MatchVideoLabel,
  RosterEntry,
} from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  scheduled: "secondary",
  played: "default",
  cancelled: "destructive",
};

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

  const addPlayerMut = useMutation({
    mutationFn: (playerId: number) =>
      addMatchPlayer(token!, clubId!, teamId, matchId, playerId),
    onSuccess: (mp) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast(`Jugador añadido a la convocatoria.`);
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

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <Link href={`/teams/${teamId}/matches`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Partidos
            </Link>
          </Button>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">vs. {match.opponent_name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {dateStr} · {timeStr} · {MATCH_LOCATION_LABELS[match.location]}
              </p>
            </div>
            <Badge variant={STATUS_VARIANT[match.status]} className="shrink-0 mt-1">
              {MATCH_STATUS_LABELS[match.status]}
            </Badge>
          </div>
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
                <p className="text-sm font-medium text-muted-foreground mb-2">Añadir a la convocatoria</p>
                <div className="border rounded-lg divide-y">
                  {notConvocado.map((re) => (
                    <div key={re.id} className="flex items-center gap-3 px-4 py-2.5">
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
          <div>
            {match.match_videos.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm mb-4">
                No hay vídeos vinculados a este partido.
              </div>
            ) : (
              <div className="border rounded-lg divide-y mb-4">
                {match.match_videos.map((mv) => (
                  <div key={mv.id} className="flex items-center gap-3 px-4 py-3">
                    <Film className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{mv.video_title ?? `Vídeo #${mv.video_id}`}</p>
                      <p className="text-xs text-muted-foreground">{MATCH_VIDEO_LABEL_LABELS[mv.label]}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              La vinculación de vídeos está disponible próximamente desde esta pantalla.
            </p>
          </div>
        )}

        {/* Tab: Estadísticas */}
        {tab === "estadisticas" && (
          <div>
            {match.match_players.length === 0 ? (
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
                          key={mp.player_id}
                          playerId={mp.player_id}
                          name={`${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim()}
                          stat={stat}
                          isCoachOrTD={isCoachOrTD}
                          onSave={(data) => upsertStatMut.mutate(data)}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </PageShell>
  );
}

function StatRow({
  playerId,
  name,
  stat,
  isCoachOrTD,
  onSave,
}: {
  playerId: number;
  name: string;
  stat: { points: number | null; minutes: number | null; assists: number | null; defensive_rebounds: number | null; offensive_rebounds: number | null; steals: number | null; turnovers: number | null; fouls: number | null } | undefined;
  isCoachOrTD: boolean;
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

  if (editing && isCoachOrTD) {
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
      className={cn("border-b hover:bg-muted/30 transition-colors", isCoachOrTD && "cursor-pointer")}
      onClick={() => isCoachOrTD && setEditing(true)}
      title={isCoachOrTD ? "Clic para editar" : undefined}
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
