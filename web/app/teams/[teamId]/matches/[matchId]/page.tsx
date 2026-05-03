"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Film, Play, CheckCircle, Upload, RotateCcw, Printer, Plus, UserMinus } from "lucide-react";
import Link from "next/link";
import {
  getMatch,
  addMatchPlayer,
  removeMatchPlayer,
  upsertMatchStat,
  updateMatch,
  startMatch,
  finishMatch,
  addMatchVideo,
  removeMatchVideo,
  listRoster,
  listVideos,
  getOpponent,
  addOpponentPlayer,
  upsertOpponentStat,
  deleteOpponentStat,
  listCompetitions,
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
  OpponentTeam,
  OpponentMatchStatUpsert,
  Competition,
} from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
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

type TabKey = "convocatoria" | "rival" | "estadisticas" | "videos";

// ── Live scoring types ────────────────────────────────────────────────────────

type StatKey =
  | "points"
  | "assists"
  | "defensive_rebounds"
  | "offensive_rebounds"
  | "steals"
  | "turnovers"
  | "fouls"
  | "blocks";

type ActionLogEntry = {
  logId: number;
  playerId: number;
  playerName: string;
  label: string;
  statKey: StatKey | null;
  delta: number;
};

// ── Page component ────────────────────────────────────────────────────────────

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

  // ── Live scoring state ──────────────────────────────────────────────────────

  const logCounterRef = useRef(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedOppPlayerId, setSelectedOppPlayerId] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState<Map<number, MatchStatUpsert>>(new Map());
  const [minutesDraft, setMinutesDraft] = useState<Map<number, string>>(new Map());
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  const [oppStatDraft, setOppStatDraft] = useState<Map<number, Partial<OpponentMatchStatUpsert>>>(new Map());
  const [oppStatSaving, setOppStatSaving] = useState<Set<number>>(new Set());
  const [showAddOppPlayer, setShowAddOppPlayer] = useState(false);
  const [oppPlayerJersey, setOppPlayerJersey] = useState("");
  const [oppPlayerName, setOppPlayerName] = useState("");
  const [oppPlayerPosition, setOppPlayerPosition] = useState("");

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: match, isLoading } = useQuery({
    queryKey: ["match", matchId],
    queryFn: () => getMatch(token!, clubId!, teamId, matchId),
    enabled: !!token && !!clubId,
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  const { data: videos = [] } = useQuery({
    queryKey: ["videos"],
    queryFn: () => listVideos(token!),
    enabled: !!token,
  });

  const { data: opponentTeam } = useQuery<OpponentTeam>({
    queryKey: ["opponent", clubId, match?.opponent_id],
    queryFn: () => getOpponent(token!, clubId!, match!.opponent_id!),
    enabled: !!token && !!clubId && !!match?.opponent_id,
  });

  const { data: competitions = [] } = useQuery<Competition[]>({
    queryKey: ["competitions", teamId, match?.season_id],
    queryFn: () => listCompetitions(token!, clubId!, teamId, match?.season_id),
    enabled: !!token && !!clubId && !!teamId && !!match?.season_id,
  });

  const competitionName = match?.competition_id
    ? competitions.find((c) => c.id === match.competition_id)?.name
    : null;

  const completedVideos = videos.filter((v) => v.status === "completed");
  const linkedVideoIds = new Set(match?.match_videos.map((mv) => mv.video_id) ?? []);
  const availableVideos = completedVideos.filter((v) => !linkedVideoIds.has(v.id));

  // Sync sessionStats: add any new players that appear after initial load
  useEffect(() => {
    if (!match) return;
    setSessionStats((prev) => {
      const next = new Map(prev);
      let changed = false;
      match.match_players.forEach((mp) => {
        if (!next.has(mp.player_id)) {
          const s = match.match_stats.find((st) => st.player_id === mp.player_id);
          next.set(mp.player_id, {
            player_id: mp.player_id,
            minutes: s?.minutes ?? null,
            points: s?.points ?? 0,
            assists: s?.assists ?? 0,
            defensive_rebounds: s?.defensive_rebounds ?? 0,
            offensive_rebounds: s?.offensive_rebounds ?? 0,
            steals: s?.steals ?? 0,
            turnovers: s?.turnovers ?? 0,
            fouls: s?.fouls ?? 0,
            blocks: s?.blocks ?? 0,
          });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setMinutesDraft((prev) => {
      const next = new Map(prev);
      let changed = false;
      match.match_players.forEach((mp) => {
        if (!next.has(mp.player_id)) {
          const s = match.match_stats.find((st) => st.player_id === mp.player_id);
          next.set(mp.player_id, s?.minutes != null ? String(s.minutes) : "");
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [match]);

  // Initialize oppStatDraft from existing opponent_stats
  useEffect(() => {
    if (!match) return;
    setOppStatDraft((prev) => {
      const next = new Map(prev);
      let changed = false;
      match.opponent_stats.forEach((s) => {
        if (!next.has(s.opponent_player_id)) {
          next.set(s.opponent_player_id, {
            opponent_player_id: s.opponent_player_id,
            points: s.points,
            minutes: s.minutes,
            assists: s.assists,
            defensive_rebounds: s.defensive_rebounds,
            offensive_rebounds: s.offensive_rebounds,
            steals: s.steals,
            turnovers: s.turnovers,
            fouls: s.fouls,
            blocks: s.blocks,
          });
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [match]);

  // ── State transitions ───────────────────────────────────────────────────────

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

  // ── Other mutations ─────────────────────────────────────────────────────────

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

  const removeAllPlayersMut = useMutation({
    mutationFn: (playerIds: number[]) =>
      Promise.all(playerIds.map((pid) => removeMatchPlayer(token!, clubId!, teamId, matchId, pid))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Convocatoria vaciada.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const upsertStatMut = useMutation({
    mutationFn: (data: MatchStatUpsert) =>
      upsertMatchStat(token!, clubId!, teamId, matchId, data),
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Auto-updates our_score in the background as points are recorded
  const updateScoreMut = useMutation({
    mutationFn: (ourScore: number) =>
      updateMatch(token!, clubId!, teamId, matchId, { our_score: ourScore }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // Auto-updates their_score in the background as rival points are recorded
  const updateRivalScoreMut = useMutation({
    mutationFn: (theirScore: number) =>
      updateMatch(token!, clubId!, teamId, matchId, { their_score: theirScore }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const saveOppStatMut = useMutation({
    mutationFn: (data: OpponentMatchStatUpsert) =>
      upsertOpponentStat(token!, clubId!, teamId, matchId, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["match", matchId] }),
    onError: (e: Error) => toast(e.message, "error"),
  });

  const deleteOppStatMut = useMutation({
    mutationFn: (statId: number) =>
      deleteOpponentStat(token!, clubId!, teamId, matchId, statId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Jugador deconvocado.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const convocarOppMut = useMutation({
    mutationFn: (oppPlayerId: number) =>
      upsertOpponentStat(token!, clubId!, teamId, matchId, { opponent_player_id: oppPlayerId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Jugador rival convocado.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const addOppPlayerInlineMut = useMutation({
    mutationFn: ({ jersey, name, position }: { jersey: number; name?: string; position?: string }) =>
      addOpponentPlayer(token!, clubId!, match!.opponent_id!, { jersey_number: jersey, name, position }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opponent", clubId, match?.opponent_id] });
      setShowAddOppPlayer(false);
      setOppPlayerJersey("");
      setOppPlayerName("");
      setOppPlayerPosition("");
      toast("Jugador añadido al rival.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // ── Live scoring handlers ───────────────────────────────────────────────────

  function handleAction(statKey: StatKey | null, delta: number, label: string) {
    if (!selectedPlayerId || !match) return;
    const mp = match.match_players.find((p) => p.player_id === selectedPlayerId);
    const playerName = mp
      ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim()
      : "Jugador";

    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: selectedPlayerId, playerName, label, statKey, delta }, ...prev].slice(0, 10),
    );

    if (statKey === null || delta === 0) return;

    const current = sessionStats.get(selectedPlayerId) ?? { player_id: selectedPlayerId };
    const currentVal = ((current[statKey] ?? 0) as number);
    const newVal = Math.max(0, currentVal + delta);
    const updated: MatchStatUpsert = { ...current, [statKey]: newVal };
    setSessionStats((prev) => new Map(prev).set(selectedPlayerId, updated));
    upsertStatMut.mutate(updated);

    if (statKey === "points" && delta > 0) {
      const currentPlayerPoints = ((current.points ?? 0) as number);
      const totalPoints = Array.from(sessionStats.values()).reduce(
        (sum, s) => sum + ((s.points ?? 0) as number),
        0,
      );
      const newTotal = totalPoints - currentPlayerPoints + newVal;
      updateScoreMut.mutate(newTotal);
    }
  }

  function handleOppAction(statKey: StatKey | null, delta: number) {
    if (!selectedOppPlayerId || !match || statKey === null || delta === 0) return;

    const current = oppStatDraft.get(selectedOppPlayerId) ?? { opponent_player_id: selectedOppPlayerId };
    const currentVal = ((current[statKey as keyof typeof current] ?? 0) as number);
    const newVal = Math.max(0, currentVal + delta);
    const updated = { ...current, opponent_player_id: selectedOppPlayerId, [statKey]: newVal };
    setOppStatDraft((prev) => new Map(prev).set(selectedOppPlayerId, updated));
    saveOppStatMut.mutate(updated as OpponentMatchStatUpsert);

    if (statKey === "points" && delta > 0) {
      const currentPlayerPts = ((current.points ?? 0) as number);
      const totalPts = Array.from(oppStatDraft.values()).reduce(
        (sum, s) => sum + ((s.points ?? 0) as number),
        0,
      );
      const newTotal = totalPts - currentPlayerPts + newVal;
      updateRivalScoreMut.mutate(newTotal);
    }
  }

  function handleUndo() {
    if (actionLog.length === 0) return;
    const last = actionLog[0];
    setActionLog((prev) => prev.slice(1));
    if (last.statKey === null || last.delta === 0) return;

    const current = sessionStats.get(last.playerId) ?? { player_id: last.playerId };
    const currentVal = ((current[last.statKey] ?? 0) as number);
    const newVal = Math.max(0, currentVal - last.delta);
    const updated: MatchStatUpsert = { ...current, [last.statKey]: newVal };
    setSessionStats((prev) => new Map(prev).set(last.playerId, updated));
    upsertStatMut.mutate(updated);

    if (last.statKey === "points" && last.delta > 0) {
      const totalPoints = Array.from(sessionStats.values()).reduce(
        (sum, s) => sum + ((s.points ?? 0) as number),
        0,
      );
      const newTotal = Math.max(0, totalPoints - last.delta);
      updateScoreMut.mutate(newTotal);
    }
  }

  function handleMinutesSave(playerId: number) {
    const minutesStr = minutesDraft.get(playerId) ?? "";
    const parsed = parseInt(minutesStr, 10);
    const minutesVal = minutesStr === "" || isNaN(parsed) ? null : parsed;
    const current = sessionStats.get(playerId) ?? { player_id: playerId };
    const updated: MatchStatUpsert = { ...current, minutes: minutesVal };
    setSessionStats((prev) => new Map(prev).set(playerId, updated));
    upsertStatMut.mutate(updated);
  }

  // ── Loading / not found ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell>
        <div className="max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-4 w-72" />
          <div className="rounded-xl border bg-muted/30 px-6 py-5 space-y-4">
            <div className="flex justify-between">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-6 w-20 rounded-full" />
            </div>
            <div className="flex items-center justify-center gap-12">
              <div className="flex-1 flex flex-col items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-14 w-16" />
              </div>
              <Skeleton className="h-8 w-4" />
              <div className="flex-1 flex flex-col items-center gap-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-14 w-16" />
              </div>
            </div>
          </div>
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-48 w-full rounded-lg" />
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
  const rosterPhotoMap = new Map(roster.map((re) => [re.player_id, re.player.photo_url]));

  const dateStr = new Date(match.date).toLocaleDateString("es-ES", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = new Date(match.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  const isTransitioning = startMut.isPending || finishMut.isPending;
  const showScore = match.status === "in_progress" || match.status === "finished";

  // ── #22 Imprimir convocatoria ─────────────────────────────────────────────────

  function handlePrintConvocatoria() {
    if (!match) return;
    const teamName = activeProfile?.team_name ?? "Equipo";
    const rows = match.match_players.map((mp) =>
      `<tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-weight:600;color:#111">
          ${mp.player_first_name} ${mp.player_last_name}
        </td>
      </tr>`
    ).join("");

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8"/>
  <title>Convocatoria — ${teamName} vs. ${match.opponent_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .meta { font-size: 13px; color: #555; margin-bottom: 24px; }
    .badge { display: inline-block; font-size: 11px; font-weight: 600;
             text-transform: uppercase; letter-spacing: .05em;
             background: #f3f4f6; border: 1px solid #d1d5db;
             border-radius: 4px; padding: 2px 8px; margin-left: 8px; vertical-align: middle; }
    table { width: 100%; border-collapse: collapse; }
    thead th { text-align: left; padding: 8px 12px; font-size: 11px;
               text-transform: uppercase; letter-spacing: .05em; color: #6b7280;
               border-bottom: 2px solid #e5e7eb; }
    tbody tr:last-child td { border-bottom: none; }
    .count { font-size: 13px; color: #6b7280; margin-bottom: 8px; }
    @media print {
      body { padding: 20px; }
      @page { margin: 1.5cm; }
    }
  </style>
</head>
<body>
  <h1>${teamName} <span style="font-weight:400;color:#555">vs.</span> ${match.opponent_name}</h1>
  <p class="meta">
    ${new Date(match.date).toLocaleDateString("es-ES", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
    &nbsp;·&nbsp; ${new Date(match.date).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
  </p>
  <p class="count">Convocados: <strong>${match.match_players.length}</strong></p>
  <table>
    <thead><tr><th>Jugador</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</body>
</html>`;

    const win = window.open("", "_blank", "width=700,height=900");
    if (!win) return;
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back link */}
        <button
          onClick={() => window.history.back()}
          className="mb-4 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          ← Volver
        </button>

        {/* ── Marcador prominente ── */}
        <div className="rounded-xl border bg-muted/30 px-6 py-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-muted-foreground">
              {dateStr} · {timeStr} · {MATCH_LOCATION_LABELS[match.location]}
            </p>
            <Badge className={statusBadgeClass(match.status)}>
              {MATCH_STATUS_LABELS[match.status]}
            </Badge>
          </div>

          <div className="flex items-center justify-center gap-6 sm:gap-12">
            <div className="flex-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 truncate">
                {activeProfile?.team_name ?? "Local"}
              </p>
              <span className="text-5xl sm:text-6xl font-bold tabular-nums">
                {match.our_score ?? "—"}
              </span>
            </div>
            <span className="text-3xl font-light text-muted-foreground">:</span>
            <div className="flex-1 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 truncate">
                {match.opponent_name}
              </p>
              <span className="text-5xl sm:text-6xl font-bold tabular-nums">
                {match.their_score ?? "—"}
              </span>
            </div>
          </div>

          {/* Acciones de transición */}
          <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
            {isCoachOrTD && match.status === "scheduled" && (
              <Button
                size="sm"
                disabled={isTransitioning}
                onClick={() => startMut.mutate()}
                className="gap-1.5"
              >
                <Play className="h-3.5 w-3.5" />
                Iniciar partido
              </Button>
            )}
            {isCoachOrTD && match.status === "in_progress" && (
              <Button
                size="sm"
                disabled={isTransitioning}
                onClick={() => finishMut.mutate()}
                className="gap-1.5"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Finalizar partido
              </Button>
            )}
            {isCoachOrTD && match.status === "finished" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScoreDialogOpen(true)}
              >
                Editar resultado final
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1 border-b mb-6">
          {(["convocatoria", "rival", "estadisticas", "videos"] as TabKey[]).map((t) => (
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
              {t === "rival" && "Rival"}
              {t === "estadisticas" && "Estadísticas"}
              {t === "videos" && "Vídeo"}
            </button>
          ))}
          {/* Print button — visible only on convocatoria tab */}
          {tab === "convocatoria" && match.match_players.length > 0 && (
            <button
              onClick={handlePrintConvocatoria}
              className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted transition-colors shrink-0"
              title="Imprimir convocatoria"
            >
              <Printer className="h-3.5 w-3.5" />
              Imprimir
            </button>
          )}
        </div>

        {/* Tab: Convocatoria */}
        {tab === "convocatoria" && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">
                  Convocados ({match.match_players.length})
                </p>
                {isCoachOrTD && match.match_players.length > 0 && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={removeAllPlayersMut.isPending}
                      >
                        <UserMinus className="h-3 w-3" />
                        Quitar todos
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Quitar toda la convocatoria?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se retirarán los {match.match_players.length} jugadores convocados. Esta acción no afecta a las estadísticas ya registradas.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => removeAllPlayersMut.mutate(match.match_players.map((mp) => mp.player_id))}
                        >
                          Quitar todos
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
              {match.match_players.length === 0 ? (
                <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                  No hay jugadores convocados aún.
                </div>
              ) : (
                <div className="border rounded-lg divide-y">
                  {match.match_players.map((mp) => {
                    const photoUrl = rosterPhotoMap.get(mp.player_id);
                    return (
                      <div key={mp.id} className="flex items-center gap-3 px-4 py-3">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={`${mp.player_first_name} ${mp.player_last_name}`}
                            className="h-10 w-10 rounded-full object-cover shrink-0"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                            {(mp.player_first_name?.[0] ?? "").toUpperCase()}{(mp.player_last_name?.[0] ?? "").toUpperCase()}
                          </div>
                        )}
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
                    );
                  })}
                </div>
              )}
            </div>

            {notConvocado.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-semibold text-muted-foreground">
                    No convocados ({notConvocado.length})
                  </p>
                  {isCoachOrTD && (
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
                  )}
                </div>
                <div className="border rounded-lg divide-y">
                  {notConvocado.map((re) => {
                    const photoUrl = re.player.photo_url;
                    return (
                      <div key={re.id} className="flex items-center gap-3 px-4 py-2.5">
                        {photoUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoUrl}
                            alt={`${re.player.first_name} ${re.player.last_name}`}
                            className="h-10 w-10 rounded-full object-cover shrink-0 opacity-60"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0 opacity-60">
                            {(re.player.first_name?.[0] ?? "").toUpperCase()}{(re.player.last_name?.[0] ?? "").toUpperCase()}
                          </div>
                        )}
                        <p className="text-sm flex-1 text-muted-foreground">{re.player.first_name} {re.player.last_name}</p>
                        {isCoachOrTD && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={addPlayerMut.isPending}
                            onClick={() => addPlayerMut.mutate(re.player_id)}
                          >
                            <UserPlus className="h-3 w-3" />
                            Convocar
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab: Rival */}
        {tab === "rival" && (
          <div className="space-y-6">
            {!match.opponent_id ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                <p className="font-medium mb-1">Sin rival registrado</p>
                <p className="text-xs">Asigna un rival al partido para gestionar la convocatoria del equipo rival.</p>
              </div>
            ) : !opponentTeam ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : (
              <>
                {/* Rival header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                      style={{ backgroundColor: opponentTeam.color ?? "#6366f1" }}
                    />
                    <span className="font-semibold">{opponentTeam.name}</span>
                  </div>
                  {isCoachOrTD && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={() => { setOppPlayerJersey(""); setOppPlayerName(""); setOppPlayerPosition(""); setShowAddOppPlayer(true); }}
                    >
                      <Plus className="h-3 w-3" />
                      Nuevo jugador rival
                    </Button>
                  )}
                </div>

                {/* Convocados del rival */}
                <div>
                  <p className="text-sm font-semibold mb-2">
                    Convocados del rival ({match.opponent_stats.length})
                  </p>
                  {match.opponent_stats.length === 0 ? (
                    <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                      No hay jugadores convocados del rival aún.
                    </div>
                  ) : (
                    <div className="border rounded-lg divide-y">
                      {match.opponent_stats.map((os) => (
                        <div key={os.id} className="flex items-center justify-between px-4 py-3">
                          <span className="text-sm font-medium">
                            <span className="text-xs text-muted-foreground mr-2">#{os.opponent_player.jersey_number}</span>
                            {os.opponent_player.name}
                          </span>
                          {isCoachOrTD && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Deconvocar jugador rival</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Se eliminarán las estadísticas de <strong>{os.opponent_player.name}</strong> en este partido.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    onClick={() => deleteOppStatMut.mutate(os.id)}
                                  >
                                    Deconvocar
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* No convocados del rival */}
                {isCoachOrTD && (() => {
                  const convocadoOppIds = new Set(match.opponent_stats.map((os) => os.opponent_player_id));
                  const notConv = opponentTeam.players.filter((p) => !convocadoOppIds.has(p.id) && !p.archived_at);
                  if (notConv.length === 0) return null;
                  return (
                    <div>
                      <p className="text-sm font-semibold text-muted-foreground mb-2">
                        No convocados ({notConv.length})
                      </p>
                      <div className="border rounded-lg divide-y">
                        {[...notConv].sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)).map((p) => (
                          <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                            <span className="text-sm">
                              <span className="text-xs text-muted-foreground mr-2">#{p.jersey_number}</span>
                              {p.name}
                            </span>
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => convocarOppMut.mutate(p.id)}
                              disabled={convocarOppMut.isPending}
                            >
                              <UserPlus className="h-3 w-3" />
                              Convocar
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Tab: Estadísticas */}
        {tab === "estadisticas" && (
          <div className="space-y-8">
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
              <>
                {/* ── Nuestro equipo ── */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {activeProfile?.team_name ?? "Nuestro equipo"}
                  </p>

                  {/* Live scoring — in_progress + coach */}
                  {match.status === "in_progress" && isCoachOrTD && (
                    match.match_players.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                        Primero añade jugadores a la convocatoria en la pestaña{" "}
                        <button
                          className="underline text-foreground"
                          onClick={() => setTab("convocatoria")}
                        >
                          Convocatoria
                        </button>
                        .
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex gap-4">
                          {/* Player cards */}
                          <div className="w-[32%] flex-shrink-0 space-y-2">
                            {match.match_players.map((mp) => {
                              const stats = sessionStats.get(mp.player_id);
                              const isSelected = selectedPlayerId === mp.player_id;
                              const pts = (stats?.points ?? 0) as number;
                              const ast = (stats?.assists ?? 0) as number;
                              const reb = ((stats?.defensive_rebounds ?? 0) as number) + ((stats?.offensive_rebounds ?? 0) as number);
                              const fal = (stats?.fouls ?? 0) as number;
                              return (
                                <button
                                  key={mp.player_id}
                                  onClick={() => setSelectedPlayerId(mp.player_id)}
                                  className={cn(
                                    "w-full text-left border rounded-lg px-3 py-2 transition-all",
                                    isSelected
                                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                                      : "hover:bg-muted/40 hover:border-muted-foreground/30",
                                  )}
                                >
                                  <p className="text-sm font-semibold truncate leading-tight">
                                    {mp.player_first_name} {mp.player_last_name}
                                  </p>
                                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>Pts <strong className="text-foreground">{pts}</strong></span>
                                    <span>Ast <strong className="text-foreground">{ast}</strong></span>
                                    <span>Reb <strong className="text-foreground">{reb}</strong></span>
                                    <span>Fal <strong className="text-foreground">{fal}</strong></span>
                                  </div>
                                  <div
                                    className="flex items-center gap-1.5 mt-1.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <span className="text-xs text-muted-foreground">Min</span>
                                    <Input
                                      type="number"
                                      min={0}
                                      className="h-5 w-12 text-xs text-center px-1 py-0"
                                      value={minutesDraft.get(mp.player_id) ?? ""}
                                      onChange={(e) =>
                                        setMinutesDraft((prev) =>
                                          new Map(prev).set(mp.player_id, e.target.value),
                                        )
                                      }
                                      onBlur={() => handleMinutesSave(mp.player_id)}
                                      placeholder="—"
                                    />
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Action buttons */}
                          <div className="flex-1 min-w-0">
                            {!selectedPlayerId ? (
                              <div className="border rounded-lg h-full min-h-[280px] flex items-center justify-center text-muted-foreground text-sm text-center p-8">
                                Selecciona un jugador para registrar acciones
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Anotación</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    <ActionButton label="+2P" sublabel="Canasta 2P" onClick={() => handleAction("points", 2, "+2P")} colorClass="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white" />
                                    <ActionButton label="+3P" sublabel="Canasta 3P" onClick={() => handleAction("points", 3, "+3P")} colorClass="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white" />
                                    <ActionButton label="+TL" sublabel="Tiro libre" onClick={() => handleAction("points", 1, "+1 TL")} colorClass="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Fallos</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    <ActionButton label="×2P" sublabel="Fallo 2P" onClick={() => handleAction(null, 0, "Fallo 2P")} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                                    <ActionButton label="×3P" sublabel="Fallo 3P" onClick={() => handleAction(null, 0, "Fallo 3P")} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                                    <ActionButton label="×TL" sublabel="Fallo TL" onClick={() => handleAction(null, 0, "Fallo TL")} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Rebotes</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <ActionButton label="REB-O" sublabel="Ofensivo" onClick={() => handleAction("offensive_rebounds", 1, "REB-O")} colorClass="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white" />
                                    <ActionButton label="REB-D" sublabel="Defensivo" onClick={() => handleAction("defensive_rebounds", 1, "REB-D")} colorClass="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Otros</p>
                                  <div className="grid grid-cols-5 gap-2">
                                    <ActionButton label="AST" sublabel="Asistencia" onClick={() => handleAction("assists", 1, "Asistencia")} colorClass="bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white" />
                                    <ActionButton label="REC" sublabel="Recuperación" onClick={() => handleAction("steals", 1, "Recuperación")} colorClass="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white" />
                                    <ActionButton label="TAP" sublabel="Tapón" onClick={() => handleAction("blocks", 1, "Tapón")} colorClass="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white" />
                                    <ActionButton label="PÉR" sublabel="Pérdida" onClick={() => handleAction("turnovers", 1, "Pérdida")} colorClass="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white" />
                                    <ActionButton label="FAL" sublabel="Falta" onClick={() => handleAction("fouls", 1, "Falta")} colorClass="bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Action log */}
                        {actionLog.length > 0 && (
                          <div className="border rounded-lg overflow-hidden">
                            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b">
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                                Últimas acciones
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground"
                                onClick={handleUndo}
                              >
                                <RotateCcw className="h-3 w-3" />
                                Deshacer
                              </Button>
                            </div>
                            <div className="divide-y">
                              {actionLog.slice(0, 5).map((entry, i) => (
                                <div
                                  key={entry.logId}
                                  className={cn(
                                    "flex items-center gap-2 px-4 py-2 text-sm",
                                    i === 0 && "bg-accent/10",
                                  )}
                                >
                                  <span className="font-medium truncate flex-1">{entry.playerName}</span>
                                  <span className={cn("text-xs px-2 py-0.5 rounded-full font-semibold shrink-0", entry.delta > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-muted text-muted-foreground")}>
                                    {entry.label}
                                  </span>
                                  {i === 0 && <span className="text-xs text-muted-foreground shrink-0">← último</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}

                  {/* Read-only for non-coach or finished */}
                  {(match.status === "finished" || (match.status === "in_progress" && !isCoachOrTD)) && (
                    match.match_players.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                        No hay jugadores en la convocatoria.
                      </div>
                    ) : (
                      <div>
                        <StatsTable matchPlayers={match.match_players} stats={match.match_stats} />
                        {match.status === "finished" && (
                          <>
                            <StatsBarChart matchPlayers={match.match_players} stats={match.match_stats} />
                            <p className="text-xs text-muted-foreground text-center py-2 mt-1">
                              Partido finalizado — estadísticas en modo lectura.
                            </p>
                          </>
                        )}
                      </div>
                    )
                  )}
                </div>

                {/* ── Equipo rival ── */}
                {match.opponent_id && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {opponentTeam ? opponentTeam.name : match.opponent_name} (rival)
                    </p>

                    {/* Live scoring for rival — in_progress + coach */}
                    {match.status === "in_progress" && isCoachOrTD && (
                      match.opponent_stats.length === 0 ? (
                        <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                          Convoca jugadores del rival en la pestaña{" "}
                          <button className="underline text-foreground" onClick={() => setTab("rival")}>
                            Rival
                          </button>{" "}
                          para registrar sus estadísticas.
                        </div>
                      ) : (
                        <div className="flex gap-4">
                          {/* Rival player cards */}
                          <div className="w-[32%] flex-shrink-0 space-y-2">
                            {match.opponent_stats.map((os) => {
                              const draft = oppStatDraft.get(os.opponent_player_id) ?? {};
                              const isSelected = selectedOppPlayerId === os.opponent_player_id;
                              const pts = (draft.points ?? 0) as number;
                              const ast = (draft.assists ?? 0) as number;
                              const reb = (((draft.defensive_rebounds ?? 0) as number) + ((draft.offensive_rebounds ?? 0) as number));
                              const fal = (draft.fouls ?? 0) as number;
                              return (
                                <button
                                  key={os.opponent_player_id}
                                  onClick={() => setSelectedOppPlayerId(os.opponent_player_id)}
                                  className={cn(
                                    "w-full text-left border rounded-lg px-3 py-2 transition-all",
                                    isSelected
                                      ? "border-primary bg-primary/5 ring-1 ring-primary shadow-sm"
                                      : "hover:bg-muted/40 hover:border-muted-foreground/30",
                                  )}
                                >
                                  <p className="text-sm font-semibold truncate leading-tight">
                                    <span className="text-xs text-muted-foreground mr-1">#{os.opponent_player.jersey_number}</span>
                                    {os.opponent_player.name}
                                  </p>
                                  <div className="flex gap-2 mt-1 text-xs text-muted-foreground">
                                    <span>Pts <strong className="text-foreground">{pts}</strong></span>
                                    <span>Ast <strong className="text-foreground">{ast}</strong></span>
                                    <span>Reb <strong className="text-foreground">{reb}</strong></span>
                                    <span>Fal <strong className="text-foreground">{fal}</strong></span>
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          {/* Rival action buttons */}
                          <div className="flex-1 min-w-0">
                            {!selectedOppPlayerId ? (
                              <div className="border rounded-lg h-full min-h-[200px] flex items-center justify-center text-muted-foreground text-sm text-center p-8">
                                Selecciona un jugador rival para registrar acciones
                              </div>
                            ) : (
                              <div className="space-y-3">
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Anotación</p>
                                  <div className="grid grid-cols-3 gap-2">
                                    <ActionButton label="+2P" sublabel="Canasta 2P" onClick={() => handleOppAction("points", 2)} colorClass="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white" />
                                    <ActionButton label="+3P" sublabel="Canasta 3P" onClick={() => handleOppAction("points", 3)} colorClass="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white" />
                                    <ActionButton label="+TL" sublabel="Tiro libre" onClick={() => handleOppAction("points", 1)} colorClass="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Rebotes</p>
                                  <div className="grid grid-cols-2 gap-2">
                                    <ActionButton label="REB-O" sublabel="Ofensivo" onClick={() => handleOppAction("offensive_rebounds", 1)} colorClass="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white" />
                                    <ActionButton label="REB-D" sublabel="Defensivo" onClick={() => handleOppAction("defensive_rebounds", 1)} colorClass="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white" />
                                  </div>
                                </div>
                                <div>
                                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Otros</p>
                                  <div className="grid grid-cols-5 gap-2">
                                    <ActionButton label="AST" sublabel="Asistencia" onClick={() => handleOppAction("assists", 1)} colorClass="bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white" />
                                    <ActionButton label="REC" sublabel="Recuperación" onClick={() => handleOppAction("steals", 1)} colorClass="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white" />
                                    <ActionButton label="TAP" sublabel="Tapón" onClick={() => handleOppAction("blocks", 1)} colorClass="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white" />
                                    <ActionButton label="PÉR" sublabel="Pérdida" onClick={() => handleOppAction("turnovers", 1)} colorClass="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white" />
                                    <ActionButton label="FAL" sublabel="Falta" onClick={() => handleOppAction("fouls", 1)} colorClass="bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black" />
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    )}

                    {/* Read-only rival stats */}
                    {(match.status === "finished" || (match.status === "in_progress" && !isCoachOrTD)) && (
                      match.opponent_stats.length === 0 ? (
                        <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                          No hay estadísticas registradas para el equipo rival.
                        </div>
                      ) : (
                        <OppStatsTable opponentStats={match.opponent_stats} />
                      )
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Vídeo */}
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
      </div>

      {/* Score dialog (used after match is finished — both scores editable) */}
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

      {/* Add inline opponent player dialog */}
      <Dialog open={showAddOppPlayer} onOpenChange={setShowAddOppPlayer}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir jugador a {opponentTeam?.name ?? "rival"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Dorsal <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={oppPlayerJersey}
                onChange={(e) => setOppPlayerJersey(e.target.value)}
                placeholder="0–99"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre (opcional)</Label>
                <Input
                  value={oppPlayerName}
                  onChange={(e) => setOppPlayerName(e.target.value)}
                  placeholder="Nombre del jugador"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Posición (opcional)</Label>
                <Input
                  value={oppPlayerPosition}
                  onChange={(e) => setOppPlayerPosition(e.target.value)}
                  placeholder="Base, Ala..."
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddOppPlayer(false)}>Cancelar</Button>
            <Button
              onClick={() =>
                addOppPlayerInlineMut.mutate({
                  jersey: Number(oppPlayerJersey),
                  name: oppPlayerName.trim() || undefined,
                  position: oppPlayerPosition.trim() || undefined,
                })
              }
              disabled={!oppPlayerJersey.trim() || addOppPlayerInlineMut.isPending}
            >
              {addOppPlayerInlineMut.isPending ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── StatsTable — read-only stats view ────────────────────────────────────────

import type { MatchPlayer, MatchStat, OpponentMatchStat } from "@basketball-clipper/shared/types";

function StatsTable({
  matchPlayers,
  stats,
}: {
  matchPlayers: MatchPlayer[];
  stats: MatchStat[];
}) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium">Jugador</th>
            <th className="text-center px-2 py-2 font-medium w-12">Min</th>
            <th className="text-center px-2 py-2 font-medium w-12">Pts</th>
            <th className="text-center px-2 py-2 font-medium w-12">Reb</th>
            <th className="text-center px-2 py-2 font-medium w-12">Ast</th>
            <th className="text-center px-2 py-2 font-medium w-12">Rec</th>
            <th className="text-center px-2 py-2 font-medium w-12">Tap</th>
            <th className="text-center px-2 py-2 font-medium w-12">Pér</th>
            <th className="text-center px-2 py-2 font-medium w-12">Falt</th>
          </tr>
        </thead>
        <tbody>
          {matchPlayers.map((mp) => {
            const stat = stats.find((s) => s.player_id === mp.player_id);
            const totalReb = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);
            return (
              <tr key={mp.player_id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {mp.player_first_name} {mp.player_last_name}
                </td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.minutes ?? "—"}</td>
                <td className="text-center px-2 py-2.5 font-semibold">{stat?.points ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat ? totalReb : "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.assists ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.steals ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.blocks ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.turnovers ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.fouls ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── OppStatsTable — read-only opponent stats view ─────────────────────────────

function OppStatsTable({ opponentStats }: { opponentStats: OpponentMatchStat[] }) {
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium">Jugador</th>
            <th className="text-center px-2 py-2 font-medium w-12">Min</th>
            <th className="text-center px-2 py-2 font-medium w-12">Pts</th>
            <th className="text-center px-2 py-2 font-medium w-12">Reb</th>
            <th className="text-center px-2 py-2 font-medium w-12">Ast</th>
            <th className="text-center px-2 py-2 font-medium w-12">Rec</th>
            <th className="text-center px-2 py-2 font-medium w-12">Tap</th>
            <th className="text-center px-2 py-2 font-medium w-12">Pér</th>
            <th className="text-center px-2 py-2 font-medium w-12">Falt</th>
          </tr>
        </thead>
        <tbody>
          {opponentStats.map((os) => {
            const totalReb = (os.defensive_rebounds ?? 0) + (os.offensive_rebounds ?? 0);
            return (
              <tr key={os.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  <span className="text-xs text-muted-foreground mr-2">#{os.opponent_player.jersey_number}</span>
                  {os.opponent_player.name}
                </td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.minutes ?? "—"}</td>
                <td className="text-center px-2 py-2.5 font-semibold">{os.points ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{totalReb || "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.assists ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.steals ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.blocks ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.turnovers ?? "—"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.fouls ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── ActionButton ──────────────────────────────────────────────────────────────

function ActionButton({
  label,
  sublabel,
  onClick,
  colorClass,
}: {
  label: string;
  sublabel: string;
  onClick: () => void;
  colorClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex flex-col items-center justify-center rounded-lg py-3 px-2 font-bold",
        "transition-all active:scale-95 select-none touch-manipulation",
        colorClass,
      )}
    >
      <span className="text-base leading-none">{label}</span>
      <span className="text-[10px] mt-1 opacity-75 font-normal leading-none">{sublabel}</span>
    </button>
  );
}

// ── StatsBarChart — horizontal bar chart for finished match stats ─────────────

type ChartStat = "points" | "rebounds" | "assists";

const CHART_TABS: { key: ChartStat; label: string }[] = [
  { key: "points",   label: "Puntos" },
  { key: "rebounds", label: "Rebotes" },
  { key: "assists",  label: "Asistencias" },
];

function StatsBarChart({
  matchPlayers,
  stats,
}: {
  matchPlayers: MatchPlayer[];
  stats: MatchStat[];
}) {
  const [activeStat, setActiveStat] = useState<ChartStat>("points");

  const rows = matchPlayers
    .map((mp) => {
      const stat = stats.find((s) => s.player_id === mp.player_id);
      const rebounds = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);
      return {
        name: `${mp.player_first_name} ${mp.player_last_name}`,
        points:   stat?.points   ?? 0,
        rebounds,
        assists:  stat?.assists  ?? 0,
      };
    })
    .sort((a, b) => b[activeStat] - a[activeStat]);

  const maxVal = Math.max(...rows.map((r) => r[activeStat]), 1);

  return (
    <div className="mt-4 border rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">Gráfica de estadísticas</p>
        <div className="flex gap-1">
          {CHART_TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveStat(key)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                activeStat === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        {rows.map((row) => {
          const val   = row[activeStat];
          const pct   = maxVal > 0 ? (val / maxVal) * 100 : 0;
          const isTop = val === maxVal && val > 0;
          return (
            <div key={row.name} className="flex items-center gap-3">
              <span className="w-28 shrink-0 truncate text-xs text-muted-foreground text-right">
                {row.name.split(" ")[0]}
              </span>
              <div className="flex-1 h-6 bg-muted rounded-sm overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-sm transition-all duration-500",
                    isTop ? "bg-primary" : "bg-primary/40",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className={cn("w-7 shrink-0 text-xs font-semibold tabular-nums", isTop ? "text-primary" : "text-muted-foreground")}>
                {val}
              </span>
            </div>
          );
        })}

        {rows.every((r) => r[activeStat] === 0) && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Sin datos registrados para esta estadística.
          </p>
        )}
      </div>
    </div>
  );
}
