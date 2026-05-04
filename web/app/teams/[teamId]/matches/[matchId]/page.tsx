"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Film, Play, Pause, CheckCircle, Upload, RotateCcw, Plus, UserMinus, ArrowLeftRight } from "lucide-react";
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
  bulkAddOpponentPlayers,
  upsertOpponentStat,
  deleteOpponentStat,
  listCompetitions,
  setHomeStarters,
  setRivalStarters,
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
  team: "home" | "rival" | "none";
  quarter: number;
};

type QuarterStatEntry = {
  quarter: number;
  team: "home" | "rival";
  statKey: StatKey;
  delta: number;
  playerName: string;
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
  // On-court tracking (current players on pista — used for display when tracking minutes)
  const [onCourtIds, setOnCourtIds] = useState<Set<number>>(new Set());
  const [onCourtOppIds, setOnCourtOppIds] = useState<Set<number>>(new Set());
  // When player entered court (timerMs snapshot) — for auto-calculating minutes
  const [playerEnteredAtMs, setPlayerEnteredAtMs] = useState<Record<number, number>>({});
  const [rivalEnteredAtMs, setRivalEnteredAtMs] = useState<Record<number, number>>({});
  const [homeTeamSelected, setHomeTeamSelected] = useState(false);
  const [rivalTeamSelected, setRivalTeamSelected] = useState(false);
  // Lineup setup (before match start — selecting starters)
  const [lineupHomeIds, setLineupHomeIds] = useState<Set<number>>(new Set());
  const [lineupRivalIds, setLineupRivalIds] = useState<Set<number>>(new Set());
  const [lineupSaving, setLineupSaving] = useState(false);
  // Timer (elapsed time per quarter, counts up)
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMs, setTimerMs] = useState(0);
  const [currentQuarter, setCurrentQuarter] = useState(1);
  const timerBaseRef = useRef(0);
  const timerStartAtRef = useRef<number | null>(null);
  const [oppStatDraft, setOppStatDraft] = useState<Map<number, Partial<OpponentMatchStatUpsert>>>(new Map());
  const [oppStatSaving, setOppStatSaving] = useState<Set<number>>(new Set());
  const [showAddOppPlayer, setShowAddOppPlayer] = useState(false);
  const [oppPlayerJersey, setOppPlayerJersey] = useState("");
  const [oppPlayerName, setOppPlayerName] = useState("");
  const [oppPlayerPosition, setOppPlayerPosition] = useState("");
  const [showBulkAddOppPlayer, setShowBulkAddOppPlayer] = useState(false);
  const [bulkOppJerseys, setBulkOppJerseys] = useState("");
  // Substitution panel
  const [showSubstitution, setShowSubstitution] = useState(false);
  const [subOutId, setSubOutId] = useState<number | null>(null);
  const [subInId, setSubInId] = useState<number | null>(null);
  // Per-quarter stats tracking
  const [quarterStatsLog, setQuarterStatsLog] = useState<QuarterStatEntry[]>([]);

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

  // Convocatoria and rival management locked once match is finished/cancelled
  const canEditConvocatoria = isCoachOrTD && !!match && match.status !== "finished" && match.status !== "cancelled";

  const competitionName = match?.competition_id
    ? competitions.find((c) => c.id === match.competition_id)?.name
    : null;

  const matchCompetition = match?.competition_id
    ? competitions.find((c) => c.id === match.competition_id)
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

  // Session storage — restore on mount
  const sessionKey = `bball_match_${matchId}`;
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(sessionKey);
      if (!raw) return;
      const saved = JSON.parse(raw) as {
        homeOnCourt?: number[];
        rivalOnCourt?: number[];
        playerEnteredAtMs?: Record<number, number>;
        rivalEnteredAtMs?: Record<number, number>;
        timerMs?: number;
        currentQuarter?: number;
      };
      if (saved.homeOnCourt) setOnCourtIds(new Set(saved.homeOnCourt));
      if (saved.rivalOnCourt) setOnCourtOppIds(new Set(saved.rivalOnCourt));
      if (saved.playerEnteredAtMs) setPlayerEnteredAtMs(saved.playerEnteredAtMs);
      if (saved.rivalEnteredAtMs) setRivalEnteredAtMs(saved.rivalEnteredAtMs);
      if (saved.timerMs != null) { setTimerMs(saved.timerMs); timerBaseRef.current = saved.timerMs; }
      if (saved.currentQuarter != null) setCurrentQuarter(saved.currentQuarter);
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // Session storage — persist on each relevant state change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        homeOnCourt: Array.from(onCourtIds),
        rivalOnCourt: Array.from(onCourtOppIds),
        playerEnteredAtMs,
        rivalEnteredAtMs,
        timerMs,
        currentQuarter,
      }));
    } catch { /* ignore */ }
  }, [sessionKey, onCourtIds, onCourtOppIds, playerEnteredAtMs, rivalEnteredAtMs, timerMs, currentQuarter]);

  // Timer
  useEffect(() => {
    if (!timerRunning) return;
    timerStartAtRef.current = Date.now() - timerBaseRef.current;
    const id = setInterval(() => {
      setTimerMs(Date.now() - timerStartAtRef.current!);
    }, 100);
    return () => clearInterval(id);
  }, [timerRunning]);

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
    mutationFn: async () => {
      // Auto-save minutes for home players still on court
      if (match?.track_home_minutes && onCourtIds.size > 0) {
        await Promise.all(
          Array.from(onCourtIds)
            .filter((pid) => playerEnteredAtMs[pid] != null)
            .map((pid) => {
              const stintMs = timerMs - playerEnteredAtMs[pid];
              const stintMin = Math.max(0, Math.round(stintMs / 60000));
              const existingMin = (sessionStats.get(pid)?.minutes ?? 0) as number;
              return upsertMatchStat(token!, clubId!, teamId, matchId, {
                player_id: pid,
                minutes: (existingMin ?? 0) + stintMin,
              });
            }),
        );
      }
      return finishMatch(token!, clubId!, teamId, matchId);
    },
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} finalizado.`);
      // Clear session on finish
      try { sessionStorage.removeItem(sessionKey); } catch { /* ignore */ }
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const setHomeStartersMut = useMutation({
    mutationFn: (playerIds: number[]) =>
      setHomeStarters(token!, clubId!, teamId, matchId, { player_ids: playerIds }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      // Initialize on-court with confirmed starters
      const starterIds = m.match_players.filter((mp) => mp.is_starter).map((mp) => mp.player_id);
      setOnCourtIds(new Set(starterIds));
      const now = timerMs;
      const entered: Record<number, number> = {};
      starterIds.forEach((id) => { entered[id] = now; });
      setPlayerEnteredAtMs(entered);
      toast("Titulares confirmados.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const setRivalStartersMut = useMutation({
    mutationFn: (playerIds: number[]) =>
      setRivalStarters(token!, clubId!, teamId, matchId, { player_ids: playerIds }),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      const starterIds = m.opponent_stats.filter((os) => os.is_starter).map((os) => os.opponent_player_id);
      setOnCourtOppIds(new Set(starterIds));
      const now = timerMs;
      const entered: Record<number, number> = {};
      starterIds.forEach((id) => { entered[id] = now; });
      setRivalEnteredAtMs(entered);
      toast("Titulares del rival confirmados.");
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

  const bulkAddOppPlayerMut = useMutation({
    mutationFn: (jerseys: number[]) =>
      bulkAddOpponentPlayers(token!, clubId!, match!.opponent_id!, { jersey_numbers: jerseys }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["opponent", clubId, match?.opponent_id] });
      setShowBulkAddOppPlayer(false);
      setBulkOppJerseys("");
      toast("Jugadores añadidos al rival.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const convocarAllOppMut = useMutation({
    mutationFn: (oppPlayerIds: number[]) =>
      Promise.all(oppPlayerIds.map((id) =>
        upsertOpponentStat(token!, clubId!, teamId, matchId, { opponent_player_id: id })
      )),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Todos los jugadores del rival convocados.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const removeAllOppStatsMut = useMutation({
    mutationFn: (statIds: number[]) =>
      Promise.all(statIds.map((id) => deleteOpponentStat(token!, clubId!, teamId, matchId, id))),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["match", matchId] });
      toast("Convocatoria rival vaciada.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // ── Live scoring handlers ───────────────────────────────────────────────────

  function handleAction(statKey: StatKey | null, delta: number, label: string) {
    if (!match) return;
    if (homeTeamSelected) {
      const logId = ++logCounterRef.current;
      setActionLog((prev) =>
        [{ logId, playerId: -1, playerName: "Equipo", label, statKey, delta, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 10),
      );
      return;
    }
    if (!selectedPlayerId) return;
    const mp = match.match_players.find((p) => p.player_id === selectedPlayerId);
    const playerName = mp
      ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim()
      : "Jugador";

    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: selectedPlayerId, playerName, label, statKey, delta, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 10),
    );
    if (statKey !== null && delta !== 0) {
      setQuarterStatsLog((prev) => [...prev, { quarter: currentQuarter, team: "home", statKey, delta, playerName }]);
    }

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

  const OPP_STAT_LABELS: Record<StatKey, string> = {
    points: "+Pts", assists: "AST", defensive_rebounds: "REB-D",
    offensive_rebounds: "REB-O", steals: "REC", turnovers: "PÉR", fouls: "FAL", blocks: "TAP",
  };

  function handleOppAction(statKey: StatKey | null, delta: number) {
    if (!match || statKey === null || delta === 0) return;
    if (rivalTeamSelected) {
      const logId = ++logCounterRef.current;
      setActionLog((prev) =>
        [{ logId, playerId: -1, playerName: "Equipo rival", label: OPP_STAT_LABELS[statKey] ?? statKey, statKey, delta, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 10),
      );
      return;
    }
    if (!selectedOppPlayerId) return;

    // Log rival action
    const oppPlayer = match.opponent_stats.find((os) => os.opponent_player_id === selectedOppPlayerId);
    const oppName = oppPlayer
      ? (oppPlayer.opponent_player.name ?? `#${oppPlayer.opponent_player.jersey_number}`)
      : "Rival";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: selectedOppPlayerId, playerName: oppName, label: OPP_STAT_LABELS[statKey] ?? statKey, statKey, delta, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 10),
    );
    setQuarterStatsLog((prev) => [...prev, { quarter: currentQuarter, team: "rival", statKey, delta, playerName: oppName }]);

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
    // Only undo home player stats — rival stats are saved directly and not undoable here
    if (last.team !== "home" || last.statKey === null || last.delta === 0) return;

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

  // ── On-court helpers ────────────────────────────────────────────────────────

  const maxOnCourt = matchCompetition?.players_on_court ?? 5;

  function handlePlayerClick(playerId: number) {
    setHomeTeamSelected(false);
    setRivalTeamSelected(false);
    setSelectedOppPlayerId(null);
    if (onCourtIds.has(playerId)) {
      setSelectedPlayerId(playerId);
    } else {
      if (onCourtIds.size < maxOnCourt) {
        setOnCourtIds((prev) => new Set(prev).add(playerId));
        setSelectedPlayerId(playerId);
      } else {
        toast(`Máximo ${maxOnCourt} jugadores en pista`, "error");
      }
    }
  }

  function removeFromCourt(playerId: number) {
    setOnCourtIds((prev) => { const n = new Set(prev); n.delete(playerId); return n; });
    if (selectedPlayerId === playerId) setSelectedPlayerId(null);
  }

  function handleOppPlayerClick(oppPlayerId: number) {
    setRivalTeamSelected(false);
    setHomeTeamSelected(false);
    setSelectedPlayerId(null);
    if (onCourtOppIds.has(oppPlayerId)) {
      setSelectedOppPlayerId(oppPlayerId);
    } else {
      if (onCourtOppIds.size < maxOnCourt) {
        setOnCourtOppIds((prev) => new Set(prev).add(oppPlayerId));
        setSelectedOppPlayerId(oppPlayerId);
      } else {
        toast(`Máximo ${maxOnCourt} jugadores en pista`, "error");
      }
    }
  }

  function removeOppFromCourt(oppPlayerId: number) {
    setOnCourtOppIds((prev) => { const n = new Set(prev); n.delete(oppPlayerId); return n; });
    if (selectedOppPlayerId === oppPlayerId) setSelectedOppPlayerId(null);
  }

  const regularQuarters = matchCompetition?.quarters ?? 4;
  const isOT = currentQuarter > regularQuarters;
  const periodDurationMs = (isOT
    ? (matchCompetition?.overtime_minutes ?? 5)
    : (matchCompetition?.minutes_per_quarter ?? 10)) * 60 * 1000;
  const remainingMs = Math.max(0, periodDurationMs - timerMs);
  const quarterLabel = isOT ? `OT${currentQuarter - regularQuarters}` : `Q${currentQuarter}`;
  const timerDisplay = (() => {
    if (remainingMs >= 60000) {
      const totalSec = Math.floor(remainingMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }
    const s = Math.floor(remainingMs / 1000);
    const tenths = Math.floor((remainingMs % 1000) / 100);
    return `${String(s).padStart(2, "0")}.${tenths}`;
  })();

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
  const rosterJerseyMap = new Map(roster.map((re) => [re.player_id, re.jersey_number]));

  const dateStr = new Date(match.date).toLocaleDateString("es-ES", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = new Date(match.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  const isTransitioning = startMut.isPending || finishMut.isPending;

  // Starters confirmed when tracking is off, or enough is_starter flags are set
  const homeStartersConfirmed =
    !match.track_home_minutes ||
    match.match_players.filter((mp) => mp.is_starter).length >= maxOnCourt;
  const rivalStartersConfirmed =
    !match.track_rival_minutes ||
    match.opponent_stats.filter((os) => os.is_starter).length >= maxOnCourt;

  // Iniciar partido requires at least one home player + one rival player (if rival is set)
  // + confirmed starters for each team that tracks minutes
  const canStartMatch =
    match.match_players.length > 0 &&
    (!match.opponent_id || match.opponent_stats.length > 0) &&
    homeStartersConfirmed &&
    rivalStartersConfirmed;
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

          {/* Finalizar partido — solo visible en in_progress */}
          {isCoachOrTD && match.status === "in_progress" && (
            <div className="flex items-center justify-center mt-4">
              <Button
                size="sm"
                disabled={isTransitioning}
                onClick={() => finishMut.mutate()}
                className="gap-1.5"
              >
                <CheckCircle className="h-3.5 w-3.5" />
                Finalizar partido
              </Button>
            </div>
          )}
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
        </div>

        {/* Tab: Convocatoria */}
        {tab === "convocatoria" && (
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold">
                  Convocados ({match.match_players.length})
                </p>
                {canEditConvocatoria && match.match_players.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                    disabled={removeAllPlayersMut.isPending}
                    onClick={() => removeAllPlayersMut.mutate(match.match_players.map((mp) => mp.player_id))}
                  >
                    <UserMinus className="h-3 w-3" />
                    Quitar todos
                  </Button>
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
                            {rosterJerseyMap.get(mp.player_id) != null && (
                              <span className="text-xs text-muted-foreground mr-2">
                                #{rosterJerseyMap.get(mp.player_id)}
                              </span>
                            )}
                            {mp.player_first_name} {mp.player_last_name}
                          </p>
                        </div>
                        {canEditConvocatoria && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={removePlayerMut.isPending}
                            onClick={() => removePlayerMut.mutate(mp.player_id)}
                            title="Retirar de la convocatoria"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold text-muted-foreground">
                  No convocados ({notConvocado.length})
                </p>
                {canEditConvocatoria && notConvocado.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    disabled={addPlayerMut.isPending}
                    onClick={() => {
                      const maxSquad = matchCompetition?.bench_size ?? 12;
                      const slots = Math.max(0, maxSquad - match.match_players.length);
                      notConvocado.slice(0, slots).forEach((re) => addPlayerMut.mutate(re.player_id));
                    }}
                  >
                    <UserPlus className="h-3 w-3" />
                    Convocar a todos
                  </Button>
                )}
              </div>
              {notConvocado.length === 0 ? (
                <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                  Todos los jugadores de la plantilla están convocados.
                </div>
              ) : (
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
                        <p className="text-sm flex-1 text-muted-foreground">
                          {re.jersey_number != null && (
                            <span className="text-xs mr-2">#{re.jersey_number}</span>
                          )}
                          {re.player.first_name} {re.player.last_name}
                        </p>
                        {canEditConvocatoria && (
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
              )}
            </div>
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
                  {canEditConvocatoria && (
                    <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => { setBulkOppJerseys(""); setShowBulkAddOppPlayer(true); }}
                      >
                        <Plus className="h-3 w-3" />
                        Añadir jugadores
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        onClick={() => { setOppPlayerJersey(""); setOppPlayerName(""); setOppPlayerPosition(""); setShowAddOppPlayer(true); }}
                      >
                        <Plus className="h-3 w-3" />
                        Jugador individual
                      </Button>
                    </div>
                  )}
                </div>

                {/* Convocados del rival */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold">
                      Convocados del rival ({match.opponent_stats.length})
                    </p>
                    {canEditConvocatoria && match.opponent_stats.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={removeAllOppStatsMut.isPending}
                        onClick={() => removeAllOppStatsMut.mutate(match.opponent_stats.map((os) => os.id))}
                      >
                        <UserMinus className="h-3 w-3" />
                        Quitar todos
                      </Button>
                    )}
                  </div>
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
                          {canEditConvocatoria && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={deleteOppStatMut.isPending}
                              onClick={() => deleteOppStatMut.mutate(os.id)}
                              title="Deconvocar jugador rival"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* No convocados del rival — always visible */}
                {(() => {
                  const convocadoOppIds = new Set(match.opponent_stats.map((os) => os.opponent_player_id));
                  const notConv = opponentTeam.players
                    .filter((p) => !convocadoOppIds.has(p.id) && !p.archived_at)
                    .sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999));
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-semibold text-muted-foreground">
                          No convocados ({notConv.length})
                        </p>
                        {canEditConvocatoria && notConv.length > 0 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            disabled={convocarAllOppMut.isPending}
                            onClick={() => {
                              const maxSquad = matchCompetition?.bench_size ?? 12;
                              const slots = Math.max(0, maxSquad - match.opponent_stats.length);
                              convocarAllOppMut.mutate(notConv.slice(0, slots).map((p) => p.id));
                            }}
                          >
                            <UserPlus className="h-3 w-3" />
                            Convocar a todos
                          </Button>
                        )}
                      </div>
                      {notConv.length === 0 ? (
                        <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                          Todos los jugadores del rival están convocados.
                        </div>
                      ) : (
                        <div className="border rounded-lg divide-y">
                          {notConv.map((p) => (
                            <div key={p.id} className="flex items-center justify-between px-4 py-2.5">
                              <span className="text-sm">
                                <span className="text-xs text-muted-foreground mr-2">#{p.jersey_number}</span>
                                {p.name}
                              </span>
                              {canEditConvocatoria && (
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
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        )}

        {/* Tab: Estadísticas */}
        {tab === "estadisticas" && (
          <div className="space-y-4">
            {match.status === "scheduled" && (
              <div className="space-y-4">

                {/* ── Lineup setup: equipo local ── */}
                {isCoachOrTD && match.track_home_minutes && match.match_players.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          Titulares — {activeProfile?.team_name ?? "Equipo local"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {homeStartersConfirmed
                            ? `${match.match_players.filter((mp) => mp.is_starter).length} titulares confirmados ✓`
                            : `Selecciona ${maxOnCourt} jugadores · ${lineupHomeIds.size}/${maxOnCourt}`}
                        </p>
                      </div>
                      {homeStartersConfirmed ? (
                        <Button size="sm" variant="outline"
                          onClick={() => setHomeStartersMut.mutate([])}>
                          Cambiar
                        </Button>
                      ) : (
                        <Button size="sm"
                          disabled={lineupHomeIds.size !== maxOnCourt || setHomeStartersMut.isPending}
                          onClick={() => setHomeStartersMut.mutate(Array.from(lineupHomeIds))}>
                          Confirmar
                        </Button>
                      )}
                    </div>
                    <div className="divide-y">
                      {match.match_players.map((mp) => {
                        const jersey = rosterJerseyMap.get(mp.player_id);
                        const isConfirmed = homeStartersConfirmed && mp.is_starter;
                        const isPending = !homeStartersConfirmed && lineupHomeIds.has(mp.player_id);
                        const checked = isConfirmed || isPending;
                        return (
                          <button
                            key={mp.player_id}
                            disabled={homeStartersConfirmed}
                            className={cn(
                              "w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors",
                              !homeStartersConfirmed && "hover:bg-muted/30",
                              checked && "bg-primary/5",
                            )}
                            onClick={() => {
                              if (homeStartersConfirmed) return;
                              setLineupHomeIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(mp.player_id)) {
                                  next.delete(mp.player_id);
                                } else if (next.size < maxOnCourt) {
                                  next.add(mp.player_id);
                                } else {
                                  toast(`Máximo ${maxOnCourt} titulares`, "error");
                                }
                                return next;
                              });
                            }}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center",
                              checked ? "bg-primary border-primary" : "border-muted-foreground/40",
                            )}>
                              {checked && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className="text-[11px] font-medium text-muted-foreground w-7 shrink-0">
                              {jersey != null ? `#${jersey}` : ""}
                            </span>
                            <span className="text-sm">{mp.player_first_name} {mp.player_last_name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Lineup setup: equipo rival ── */}
                {isCoachOrTD && match.track_rival_minutes && match.opponent_stats.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="px-4 py-3 border-b bg-muted/20 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">
                          Titulares — {opponentTeam?.name ?? match.opponent_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {rivalStartersConfirmed
                            ? `${match.opponent_stats.filter((os) => os.is_starter).length} titulares confirmados ✓`
                            : `Selecciona ${maxOnCourt} jugadores · ${lineupRivalIds.size}/${maxOnCourt}`}
                        </p>
                      </div>
                      {rivalStartersConfirmed ? (
                        <Button size="sm" variant="outline"
                          onClick={() => setRivalStartersMut.mutate([])}>
                          Cambiar
                        </Button>
                      ) : (
                        <Button size="sm"
                          disabled={lineupRivalIds.size !== maxOnCourt || setRivalStartersMut.isPending}
                          onClick={() => setRivalStartersMut.mutate(Array.from(lineupRivalIds))}>
                          Confirmar
                        </Button>
                      )}
                    </div>
                    <div className="divide-y">
                      {match.opponent_stats.map((os) => {
                        const isConfirmed = rivalStartersConfirmed && os.is_starter;
                        const isPending = !rivalStartersConfirmed && lineupRivalIds.has(os.opponent_player_id);
                        const checked = isConfirmed || isPending;
                        return (
                          <button
                            key={os.opponent_player_id}
                            disabled={rivalStartersConfirmed}
                            className={cn(
                              "w-full px-4 py-2.5 flex items-center gap-3 text-left transition-colors",
                              !rivalStartersConfirmed && "hover:bg-muted/30",
                              checked && "bg-primary/5",
                            )}
                            onClick={() => {
                              if (rivalStartersConfirmed) return;
                              setLineupRivalIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(os.opponent_player_id)) {
                                  next.delete(os.opponent_player_id);
                                } else if (next.size < maxOnCourt) {
                                  next.add(os.opponent_player_id);
                                } else {
                                  toast(`Máximo ${maxOnCourt} titulares`, "error");
                                }
                                return next;
                              });
                            }}
                          >
                            <div className={cn(
                              "h-4 w-4 rounded shrink-0 border-2 flex items-center justify-center",
                              checked ? "bg-primary border-primary" : "border-muted-foreground/40",
                            )}>
                              {checked && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className="text-[11px] font-medium text-muted-foreground w-7 shrink-0">
                              {os.opponent_player.jersey_number != null ? `#${os.opponent_player.jersey_number}` : ""}
                            </span>
                            <span className="text-sm">{os.opponent_player.name ?? "Jugador"}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Iniciar partido ── */}
                <div className="border rounded-lg p-8 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Las estadísticas se registran durante el partido.
                  </p>
                  {isCoachOrTD && (
                    canStartMatch ? (
                      <Button size="sm" disabled={isTransitioning} onClick={() => startMut.mutate()} className="gap-1.5">
                        <Play className="h-3.5 w-3.5" />
                        Iniciar partido
                      </Button>
                    ) : (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <p className="font-medium text-foreground text-sm">Para iniciar el partido necesitas:</p>
                        {match.match_players.length === 0 && (
                          <p>· <button className="underline" onClick={() => setTab("convocatoria")}>Añadir jugadores a la convocatoria</button></p>
                        )}
                        {!!match.opponent_id && match.opponent_stats.length === 0 && (
                          <p>· <button className="underline" onClick={() => setTab("rival")}>Convocar al menos un jugador del rival</button></p>
                        )}
                        {match.match_players.length > 0 && !homeStartersConfirmed && (
                          <p>· Confirmar los titulares del equipo local ({lineupHomeIds.size}/{maxOnCourt})</p>
                        )}
                        {match.opponent_stats.length > 0 && !rivalStartersConfirmed && (
                          <p>· Confirmar los titulares del rival ({lineupRivalIds.size}/{maxOnCourt})</p>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            )}

            {match.status === "cancelled" && (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                El partido fue cancelado — no hay estadísticas disponibles.
              </div>
            )}

            {match.status === "in_progress" && isCoachOrTD && (
              <>
                {/* ── Cronómetro ── */}
                <div className="border rounded-lg bg-muted/20">
                  <div className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className={cn(
                        "text-xs font-bold rounded px-2 py-0.5",
                        isOT ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" : "bg-muted text-muted-foreground"
                      )}>
                        {quarterLabel}/{regularQuarters}Q
                      </span>
                      <span className={cn(
                        "font-mono text-2xl font-bold tabular-nums tracking-tight",
                        remainingMs < 60000 && remainingMs > 0 ? "text-orange-500" : remainingMs === 0 ? "text-red-500" : ""
                      )}>
                        {timerDisplay}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant={timerRunning ? "default" : "outline"} className="h-8 gap-1.5 text-xs"
                        onClick={() => {
                          if (timerRunning) {
                            timerBaseRef.current = timerMs;
                            setTimerRunning(false);
                          } else {
                            setTimerRunning(true);
                          }
                        }}>
                        {timerRunning ? <><Pause className="h-3 w-3" />Pausar</> : <><Play className="h-3 w-3" />{timerMs > 0 ? "Reanudar" : "Iniciar"}</>}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"
                        onClick={() => {
                          timerBaseRef.current = 0;
                          setTimerMs(0);
                          if (timerRunning) { setTimerRunning(false); setTimeout(() => setTimerRunning(true), 0); }
                        }}>
                        <RotateCcw className="h-3 w-3" />Reset
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 text-xs"
                        onClick={() => {
                          timerBaseRef.current = 0;
                          setTimerMs(0);
                          setTimerRunning(false);
                          setCurrentQuarter((q) => q + 1);
                        }}>
                        {currentQuarter < regularQuarters
                          ? `Q${currentQuarter + 1} →`
                          : currentQuarter === regularQuarters
                          ? "Prórroga →"
                          : `OT${currentQuarter - regularQuarters + 1} →`}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs"
                        onClick={() => { setShowSubstitution((s) => !s); setSubOutId(null); setSubInId(null); }}>
                        <ArrowLeftRight className="h-3 w-3" />Cambio
                      </Button>
                    </div>
                  </div>
                  {/* Substitution panel */}
                  {showSubstitution && (
                    <div className="border-t px-4 py-3 space-y-2 bg-accent/5">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Sustitución</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sale (en pista)</Label>
                          <Select value={subOutId !== null ? String(subOutId) : ""} onValueChange={(v) => setSubOutId(Number(v))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador que sale" /></SelectTrigger>
                            <SelectContent>
                              {match.match_players.filter((mp) => onCourtIds.has(mp.player_id)).map((mp) => (
                                <SelectItem key={mp.player_id} value={String(mp.player_id)}>
                                  {rosterJerseyMap.get(mp.player_id) != null ? `#${rosterJerseyMap.get(mp.player_id)} ` : ""}
                                  {mp.player_first_name} {mp.player_last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Entra (banquillo)</Label>
                          <Select value={subInId !== null ? String(subInId) : ""} onValueChange={(v) => setSubInId(Number(v))}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Jugador que entra" /></SelectTrigger>
                            <SelectContent>
                              {match.match_players.filter((mp) => !onCourtIds.has(mp.player_id)).map((mp) => (
                                <SelectItem key={mp.player_id} value={String(mp.player_id)}>
                                  {rosterJerseyMap.get(mp.player_id) != null ? `#${rosterJerseyMap.get(mp.player_id)} ` : ""}
                                  {mp.player_first_name} {mp.player_last_name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button variant="outline" size="sm" className="h-7 text-xs"
                          onClick={() => { setShowSubstitution(false); setSubOutId(null); setSubInId(null); }}>
                          Cancelar
                        </Button>
                        <Button size="sm" className="h-7 text-xs"
                          disabled={subOutId === null || subInId === null}
                          onClick={() => {
                            if (subOutId === null || subInId === null) return;
                            // Auto-calculate minutes for player leaving court
                            if (match.track_home_minutes && playerEnteredAtMs[subOutId] != null) {
                              const stintMs = timerMs - playerEnteredAtMs[subOutId];
                              const stintMin = Math.max(0, Math.round(stintMs / 60000));
                              const existingMin = sessionStats.get(subOutId)?.minutes ?? 0;
                              const newMin = (existingMin ?? 0) + stintMin;
                              setSessionStats((prev) => {
                                const next = new Map(prev);
                                next.set(subOutId, { ...(next.get(subOutId) ?? { player_id: subOutId }), minutes: newMin });
                                return next;
                              });
                              upsertStatMut.mutate({ player_id: subOutId, minutes: newMin });
                              // Update enteredAt: player out leaves, player in starts counting
                              setPlayerEnteredAtMs((prev) => {
                                const next = { ...prev };
                                delete next[subOutId];
                                next[subInId] = timerMs;
                                return next;
                              });
                            }
                            setOnCourtIds((prev) => { const n = new Set(prev); n.delete(subOutId); n.add(subInId); return n; });
                            const outMp = match.match_players.find((mp) => mp.player_id === subOutId);
                            const inMp = match.match_players.find((mp) => mp.player_id === subInId);
                            const outName = outMp ? `${outMp.player_first_name ?? ""} ${outMp.player_last_name ?? ""}`.trim() : "Jugador";
                            const inName = inMp ? `${inMp.player_first_name ?? ""} ${inMp.player_last_name ?? ""}`.trim() : "Jugador";
                            const logId = ++logCounterRef.current;
                            setActionLog((prev) =>
                              [{ logId, playerId: subInId, playerName: inName, label: `↔ ${outName}`, statKey: null, delta: 0, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 10),
                            );
                            if (selectedPlayerId === subOutId) setSelectedPlayerId(subInId);
                            setShowSubstitution(false); setSubOutId(null); setSubInId(null);
                          }}>
                          Confirmar cambio
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── 3 columnas: local | acciones | rival ── */}
                <div className="grid gap-3" style={{ gridTemplateColumns: "220px 1fr 220px" }}>

                  {/* Columna izquierda: jugadores locales */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                      {activeProfile?.team_name ?? "Local"} · {onCourtIds.size}/{maxOnCourt} en pista
                    </p>
                    {(match.track_home_minutes
                      ? match.match_players.filter((mp) => onCourtIds.has(mp.player_id))
                      : match.match_players
                    ).map((mp) => {
                      const stats = sessionStats.get(mp.player_id);
                      const isSelected = selectedPlayerId === mp.player_id;
                      const isOnCourt = onCourtIds.has(mp.player_id);
                      const photoUrl = rosterPhotoMap.get(mp.player_id);
                      const jersey = rosterJerseyMap.get(mp.player_id);
                      const pts = (stats?.points ?? 0) as number;
                      const ast = (stats?.assists ?? 0) as number;
                      const reb = ((stats?.defensive_rebounds ?? 0) as number) + ((stats?.offensive_rebounds ?? 0) as number);
                      const fal = (stats?.fouls ?? 0) as number;
                      const isExcluded = fal >= 5;
                      const isFoulWarning = fal === 4;
                      // Live minutes: saved minutes + current stint if on court
                      const savedMin = (stats?.minutes ?? 0) as number;
                      const currentStintMin = match.track_home_minutes && isOnCourt && playerEnteredAtMs[mp.player_id] != null
                        ? Math.round((timerMs - playerEnteredAtMs[mp.player_id]) / 60000)
                        : 0;
                      const liveMin = (savedMin ?? 0) + currentStintMin;
                      return (
                        <button
                          key={mp.player_id}
                          onClick={() => handlePlayerClick(mp.player_id)}
                          className={cn(
                            "w-full text-left rounded-lg p-2 transition-all border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-md"
                              : isOnCourt
                              ? "border-primary/60 bg-primary/10"
                              : isExcluded
                              ? "border-red-300 bg-red-50/50 dark:bg-red-900/10 opacity-60"
                              : "border-border hover:bg-muted/40",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-10 w-10 rounded-full shrink-0 overflow-hidden bg-muted flex items-center justify-center border border-border">
                              {photoUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                              ) : (
                                <span className={cn("font-bold text-sm", isSelected ? "text-primary-foreground" : "text-foreground")}>
                                  {jersey != null ? jersey : `${mp.player_first_name?.[0] ?? ""}${mp.player_last_name?.[0] ?? ""}`}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              {jersey != null && (
                                <div className={cn("text-[10px] font-bold leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  #{jersey}
                                </div>
                              )}
                              <p className="text-xs font-semibold truncate leading-tight">
                                {mp.player_first_name} {mp.player_last_name}
                              </p>
                              <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                  {pts}p · {ast}a · {reb}r{match.track_home_minutes ? ` · ${liveMin}min` : ""}
                                </span>
                                {isExcluded ? (
                                  <span className="text-[9px] font-bold bg-red-500 text-white rounded px-1 py-px leading-none">EXCL</span>
                                ) : isFoulWarning ? (
                                  <span className={cn("text-[10px] font-bold leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>
                                    {fal}F ⚠
                                  </span>
                                ) : (
                                  <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                    {fal}f
                                  </span>
                                )}
                              </div>
                            </div>
                            {isOnCourt && (
                              <button
                                onClick={(e) => { e.stopPropagation(); removeFromCourt(mp.player_id); }}
                                className={cn("text-sm shrink-0 px-1 rounded hover:bg-black/10", isSelected ? "text-primary-foreground" : "text-muted-foreground")}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        </button>
                      );
                    })}
                    {/* Botón equipo local */}
                    <button
                      onClick={() => { setHomeTeamSelected(true); setSelectedPlayerId(null); setRivalTeamSelected(false); setSelectedOppPlayerId(null); }}
                      className={cn(
                        "w-full text-left rounded-lg p-2 transition-all border",
                        homeTeamSelected ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-dashed border-muted-foreground/30 hover:bg-muted/30",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-lg">
                          🏀
                        </div>
                        <div>
                          <p className="text-xs font-semibold">Equipo</p>
                          <p className={cn("text-[10px]", homeTeamSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                            Sin jugador asignado
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>

                  {/* Columna central: pad de acciones */}
                  <div className="space-y-2">
                    {/* Indicador jugador activo */}
                    <div className={cn(
                      "text-center text-sm font-medium border rounded-lg px-3 py-2 truncate",
                      (selectedPlayerId !== null || homeTeamSelected || selectedOppPlayerId !== null || rivalTeamSelected)
                        ? "bg-accent/20"
                        : "text-muted-foreground",
                    )}>
                      {homeTeamSelected
                        ? `${activeProfile?.team_name ?? "Local"} — Equipo`
                        : rivalTeamSelected
                        ? `${opponentTeam?.name ?? match.opponent_name} — Equipo rival`
                        : selectedPlayerId !== null
                        ? (() => {
                            const mp = match.match_players.find((p) => p.player_id === selectedPlayerId);
                            return mp ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim() : "";
                          })()
                        : selectedOppPlayerId !== null
                        ? (() => {
                            const os = match.opponent_stats.find((o) => o.opponent_player_id === selectedOppPlayerId);
                            return os ? `#${os.opponent_player.jersey_number} ${os.opponent_player.name ?? ""}`.trim() : "";
                          })()
                        : <span className="text-muted-foreground text-xs">Selecciona un jugador o equipo</span>}
                    </div>

                    {(selectedPlayerId !== null || homeTeamSelected || selectedOppPlayerId !== null || rivalTeamSelected) ? (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <ActionButton label="+2P" sublabel="Canasta 2P" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 2, "+2P"); else handleOppAction("points", 2); }} colorClass="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white" />
                          <ActionButton label="+3P" sublabel="Canasta 3P" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 3, "+3P"); else handleOppAction("points", 3); }} colorClass="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white" />
                          <ActionButton label="+TL" sublabel="Tiro libre" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 1, "+1 TL"); else handleOppAction("points", 1); }} colorClass="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white" />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <ActionButton label="×2P" sublabel="Fallo 2P" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo 2P"); }} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                          <ActionButton label="×3P" sublabel="Fallo 3P" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo 3P"); }} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                          <ActionButton label="×TL" sublabel="Fallo TL" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo TL"); }} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <ActionButton label="REB-O" sublabel="Ofensivo" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("offensive_rebounds", 1, "REB-O"); else handleOppAction("offensive_rebounds", 1); }} colorClass="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white" />
                          <ActionButton label="REB-D" sublabel="Defensivo" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("defensive_rebounds", 1, "REB-D"); else handleOppAction("defensive_rebounds", 1); }} colorClass="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white" />
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <ActionButton label="AST" sublabel="Asistencia" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("assists", 1, "Asistencia"); else handleOppAction("assists", 1); }} colorClass="bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white" />
                          <ActionButton label="REC" sublabel="Recuperación" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("steals", 1, "Recuperación"); else handleOppAction("steals", 1); }} colorClass="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white" />
                          <ActionButton label="TAP" sublabel="Tapón" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("blocks", 1, "Tapón"); else handleOppAction("blocks", 1); }} colorClass="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white" />
                          <ActionButton label="PÉR" sublabel="Pérdida" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("turnovers", 1, "Pérdida"); else handleOppAction("turnovers", 1); }} colorClass="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white" />
                          <ActionButton label="FAL" sublabel="Falta" onClick={() => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("fouls", 1, "Falta"); else handleOppAction("fouls", 1); }} colorClass="bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black" />
                        </div>
                      </div>
                    ) : (
                      <div className="border rounded-lg flex items-center justify-center min-h-[200px] text-muted-foreground text-sm text-center p-8">
                        Selecciona un jugador o equipo para registrar acciones
                      </div>
                    )}

                    {/* Action log */}
                    {actionLog.length > 0 && (
                      <div className="border rounded-lg overflow-hidden">
                        <div className="flex items-center justify-between px-3 py-1.5 bg-muted/30 border-b">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Últimas acciones</p>
                          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-muted-foreground hover:text-foreground" onClick={handleUndo}>
                            <RotateCcw className="h-3 w-3" />Deshacer
                          </Button>
                        </div>
                        <div className="divide-y">
                          {actionLog.slice(0, 5).map((entry, i) => (
                            <div key={entry.logId} className={cn("flex items-center gap-2 px-3 py-1.5 text-xs", i === 0 && "bg-accent/10")}>
                              <span className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                entry.team === "home" ? "bg-blue-500" : entry.team === "rival" ? "bg-orange-500" : "bg-muted-foreground/40"
                              )} />
                              <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                                {entry.quarter > (matchCompetition?.quarters ?? 4) ? `OT${entry.quarter - (matchCompetition?.quarters ?? 4)}` : `Q${entry.quarter}`}
                              </span>
                              <span className="font-medium truncate flex-1">{entry.playerName}</span>
                              <span className={cn("px-1.5 py-0.5 rounded-full font-semibold shrink-0 text-[10px]", entry.delta > 0 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400" : "bg-muted text-muted-foreground")}>
                                {entry.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Columna derecha: jugadores rival */}
                  <div className="space-y-1.5">
                    {!match.opponent_id ? (
                      <div className="border rounded-lg p-4 text-center text-xs text-muted-foreground">
                        Sin rival registrado
                      </div>
                    ) : match.opponent_stats.length === 0 ? (
                      <div className="border rounded-lg p-4 text-center text-xs text-muted-foreground">
                        <button className="underline" onClick={() => setTab("rival")}>Convocar jugadores del rival</button>
                      </div>
                    ) : (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                          {opponentTeam?.name ?? match.opponent_name} · {onCourtOppIds.size}/{maxOnCourt}
                        </p>
                        {match.opponent_stats.map((os) => {
                          const draft = oppStatDraft.get(os.opponent_player_id) ?? {};
                          const isSelected = selectedOppPlayerId === os.opponent_player_id;
                          const isOnCourt = onCourtOppIds.has(os.opponent_player_id);
                          const pts = (draft.points ?? 0) as number;
                          const ast = (draft.assists ?? 0) as number;
                          const reb = ((draft.defensive_rebounds ?? 0) as number) + ((draft.offensive_rebounds ?? 0) as number);
                          const fal = (draft.fouls ?? 0) as number;
                          const oppExcluded = fal >= 5;
                          const oppFoulWarn = fal === 4;
                          return (
                            <button
                              key={os.opponent_player_id}
                              onClick={() => handleOppPlayerClick(os.opponent_player_id)}
                              className={cn(
                                "w-full text-left rounded-lg p-2 transition-all border",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground shadow-md"
                                  : isOnCourt
                                  ? "border-primary/60 bg-primary/10"
                                  : oppExcluded
                                  ? "border-red-300 bg-red-50/50 dark:bg-red-900/10 opacity-60"
                                  : "border-border hover:bg-muted/40",
                              )}
                            >
                              <div className="flex items-center gap-2">
                                <div className={cn(
                                  "h-10 w-10 rounded-full shrink-0 flex items-center justify-center border font-bold text-sm",
                                  isSelected ? "bg-primary-foreground/20 border-primary-foreground/30 text-primary-foreground" : "bg-muted border-border",
                                )}>
                                  {os.opponent_player.jersey_number ?? "?"}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={cn("text-[10px] font-bold leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                    #{os.opponent_player.jersey_number}
                                  </div>
                                  <p className="text-xs font-semibold truncate leading-tight">
                                    {os.opponent_player.name ?? `#${os.opponent_player.jersey_number}`}
                                  </p>
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                      {pts}p · {ast}a · {reb}r
                                    </span>
                                    {oppExcluded ? (
                                      <span className="text-[9px] font-bold bg-red-500 text-white rounded px-1 py-px leading-none">EXCL</span>
                                    ) : oppFoulWarn ? (
                                      <span className={cn("text-[10px] font-bold leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>
                                        {fal}F ⚠
                                      </span>
                                    ) : (
                                      <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                        {fal}f
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {isOnCourt && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); removeOppFromCourt(os.opponent_player_id); }}
                                    className={cn("text-sm shrink-0 px-1 rounded hover:bg-black/10", isSelected ? "text-primary-foreground" : "text-muted-foreground")}
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            </button>
                          );
                        })}
                        {/* Botón equipo rival */}
                        <button
                          onClick={() => { setRivalTeamSelected(true); setSelectedOppPlayerId(null); setHomeTeamSelected(false); setSelectedPlayerId(null); }}
                          className={cn(
                            "w-full text-left rounded-lg p-2 transition-all border",
                            rivalTeamSelected ? "border-primary bg-primary text-primary-foreground shadow-md" : "border-dashed border-muted-foreground/30 hover:bg-muted/30",
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <div className="h-10 w-10 rounded-full bg-muted/50 flex items-center justify-center shrink-0 text-lg">
                              🏀
                            </div>
                            <div>
                              <p className="text-xs font-semibold">Equipo rival</p>
                              <p className={cn("text-[10px]", rivalTeamSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                Sin jugador asignado
                              </p>
                            </div>
                          </div>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Finalizar partido */}
                <div className="flex items-center justify-center pt-2">
                  <Button size="sm" disabled={isTransitioning} onClick={() => finishMut.mutate()} className="gap-1.5">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Finalizar partido
                  </Button>
                </div>
              </>
            )}

            {/* Read-only: in_progress + non-coach OR finished */}
            {(match.status === "in_progress" && !isCoachOrTD) || match.status === "finished" ? (
              <div className="space-y-8">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {activeProfile?.team_name ?? "Nuestro equipo"}
                  </p>
                  {match.status === "in_progress" && !isCoachOrTD && (
                    match.match_players.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">No hay jugadores en la convocatoria.</div>
                    ) : (
                      <StatsTable matchPlayers={match.match_players} stats={match.match_stats} />
                    )
                  )}
                  {match.status === "finished" && (
                    match.match_stats.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">No se registraron estadísticas en este partido.</div>
                    ) : (
                      <div>
                        <StatsTable matchPlayers={match.match_players} stats={match.match_stats} />
                        <StatsBarChart matchPlayers={match.match_players} stats={match.match_stats} />
                        <p className="text-xs text-muted-foreground text-center py-2 mt-1">Partido finalizado — estadísticas en modo lectura.</p>
                      </div>
                    )
                  )}
                </div>
                {match.opponent_id && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {opponentTeam ? opponentTeam.name : match.opponent_name} (rival)
                    </p>
                    {match.opponent_stats.length === 0 ? (
                      <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">No hay estadísticas registradas para el equipo rival.</div>
                    ) : (
                      <OppStatsTable opponentStats={match.opponent_stats} />
                    )}
                  </div>
                )}
              </div>
            ) : null}
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

            {isCoachOrTD && match.status !== "finished" && (
              <div className="border rounded-lg p-4 text-center text-sm text-muted-foreground">
                Los vídeos del partido se pueden vincular una vez finalizado el partido.
              </div>
            )}
            {isCoachOrTD && match.status === "finished" && (
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

      {/* Bulk add opponent players dialog */}
      {(() => {
        const existingOppJerseys = new Set(
          opponentTeam?.players.filter((p) => !p.archived_at).map((p) => p.jersey_number) ?? []
        );
        const parsedOppJerseys = bulkOppJerseys
          .split(/[,\s]+/)
          .map((s) => s.trim())
          .filter((s) => s !== "")
          .map(Number)
          .filter((n) => !isNaN(n) && n >= 0 && n <= 99);
        const newOppJerseys = parsedOppJerseys.filter((n) => !existingOppJerseys.has(n));
        const dupOppJerseys = parsedOppJerseys.filter((n) => existingOppJerseys.has(n));
        return (
          <Dialog open={showBulkAddOppPlayer} onOpenChange={(o) => { if (!o) { setShowBulkAddOppPlayer(false); setBulkOppJerseys(""); } }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Añadir jugadores a {opponentTeam?.name ?? "rival"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Dorsales (separados por comas o espacios)</Label>
                  <Input
                    value={bulkOppJerseys}
                    onChange={(e) => setBulkOppJerseys(e.target.value)}
                    placeholder="Ej: 4, 7, 11, 14, 23"
                  />
                </div>
                {newOppJerseys.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Nuevos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {newOppJerseys.map((n, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                          #{n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {dupOppJerseys.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-destructive">Ya existen (se omitirán):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {dupOppJerseys.map((n, i) => (
                        <span key={i} className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2.5 py-0.5 text-xs font-medium line-through">
                          #{n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Se crearán {newOppJerseys.length} jugador{newOppJerseys.length !== 1 ? "es" : ""}.
                  Podrás editar sus nombres después.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowBulkAddOppPlayer(false); setBulkOppJerseys(""); }}>Cancelar</Button>
                <Button
                  onClick={() => bulkAddOppPlayerMut.mutate(newOppJerseys)}
                  disabled={newOppJerseys.length === 0 || bulkAddOppPlayerMut.isPending}
                >
                  {bulkAddOppPlayerMut.isPending ? "Añadiendo..." : `Añadir ${newOppJerseys.length > 0 ? newOppJerseys.length : ""} jugadores`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </PageShell>
  );
}

// ── StatsTable — read-only stats view ────────────────────────────────────────────

import type { MatchPlayer, MatchStat, OpponentMatchStat } from "@basketball-clipper/shared/types";

function StatsTable({
  matchPlayers,
  stats,
}: {
  matchPlayers: MatchPlayer[];
  stats: MatchStat[];
}) {
  // When match_players is empty (convocatoria not set up), fall back to rendering
  // rows directly from match_stats using the player names embedded in each stat.
  const rows =
    matchPlayers.length > 0
      ? matchPlayers.map((mp) => {
          const stat = stats.find((s) => s.player_id === mp.player_id);
          return { key: mp.player_id, firstName: mp.player_first_name, lastName: mp.player_last_name, stat };
        })
      : stats.map((s) => ({
          key: s.player_id,
          firstName: s.player_first_name,
          lastName: s.player_last_name,
          stat: s,
        }));

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
          {rows.map(({ key, firstName, lastName, stat }) => {
            const totalReb = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);
            return (
              <tr key={key} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {firstName} {lastName}
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

// ── OppStatsTable — read-only opponent stats view ────────────────────────────────────────────────

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

// ── ActionButton ────────────────────────────────────────────────────────────────────────────

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

// ── StatsBarChart — horizontal bar chart for finished match stats ─────────────────────────────

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

  const rows = (
    matchPlayers.length > 0
      ? matchPlayers.map((mp) => {
          const stat = stats.find((s) => s.player_id === mp.player_id);
          return { name: `${mp.player_first_name} ${mp.player_last_name}`, stat };
        })
      : stats.map((s) => ({ name: `${s.player_first_name} ${s.player_last_name}`, stat: s }))
  )
    .map(({ name, stat }) => {
      const rebounds = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);
      return {
        name,
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
