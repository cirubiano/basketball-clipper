"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Film, Play, Pause, CheckCircle, Upload, RotateCcw, Plus, UserMinus, ArrowLeftRight, Pencil, ChevronRight, ChevronUp, ChevronDown } from "lucide-react";
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
  listStatAttributes,
  listCustomMatchStats,
  upsertCustomMatchStat,
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
  TeamStatAttribute,
  CustomMatchStat,
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

type TabKey = "convocatoria" | "rival" | "estadisticas" | "informe" | "jugada" | "videos";

// ── Session storage helpers ───────────────────────────────────────────────────

function readSessionData(matchId: number): {
  homeOnCourt?: number[];
  rivalOnCourt?: number[];
  playerEnteredAtMs?: Record<number, number>;
  rivalEnteredAtMs?: Record<number, number>;
  playerExitedAtMs?: Record<number, number>;
  playerExitedWithTotalMs?: Record<number, number>;
  rivalExitedAtMs?: Record<number, number>;
  rivalExitedWithTotalMs?: Record<number, number>;
  timerMs?: number;
  currentQuarter?: number;
} | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`bball_match_${matchId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

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
  customStatAttrId?: number;
};

type QuarterStatEntry = {
  quarter: number;
  team: "home" | "rival";
  statKey: StatKey;
  delta: number;
  playerName: string;
};

// ── Page component ────────────────────────────────────────────────────────────

// ── Custom stat color map — keyed by TeamStatAttribute.color ──────────────────
const CUSTOM_STAT_COLOR_MAP: Record<string, string> = {
  violet: "bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white",
  blue:   "bg-blue-500   hover:bg-blue-600   active:bg-blue-700   text-white",
  green:  "bg-green-500  hover:bg-green-600  active:bg-green-700  text-white",
  orange: "bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white",
  rose:   "bg-rose-500   hover:bg-rose-600   active:bg-rose-700   text-white",
  purple: "bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white",
  teal:   "bg-teal-500   hover:bg-teal-600   active:bg-teal-700   text-white",
  amber:  "bg-amber-400  hover:bg-amber-500  active:bg-amber-600  text-black",
  cyan:   "bg-cyan-500   hover:bg-cyan-600   active:bg-cyan-700   text-white",
  pink:   "bg-pink-500   hover:bg-pink-600   active:bg-pink-700   text-white",
};

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
  const [informeStatsTab, setInformeStatsTab] = useState<"predefined" | "custom">("predefined");

  // ── Live scoring state ──────────────────────────────────────────────────────

  const logCounterRef = useRef(0);
  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedOppPlayerId, setSelectedOppPlayerId] = useState<number | null>(null);
  const [sessionStats, setSessionStats] = useState<Map<number, MatchStatUpsert>>(new Map());
  const [minutesDraft, setMinutesDraft] = useState<Map<number, string>>(new Map());
  const [actionLog, setActionLog] = useState<ActionLogEntry[]>([]);
  // On-court tracking (current players on pista — used for display when tracking minutes)
  // Lazy initializers read sessionStorage synchronously to avoid the save-effect
  // overwriting persisted data before the restore-effect can apply it.
  const [onCourtIds, setOnCourtIds] = useState<Set<number>>(
    () => new Set(readSessionData(matchId)?.homeOnCourt ?? []),
  );
  const [onCourtOppIds, setOnCourtOppIds] = useState<Set<number>>(
    () => new Set(readSessionData(matchId)?.rivalOnCourt ?? []),
  );
  // When player entered court (timerMs snapshot) — for auto-calculating minutes
  const [playerEnteredAtMs, setPlayerEnteredAtMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.playerEnteredAtMs ?? {},
  );
  const [rivalEnteredAtMs, setRivalEnteredAtMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.rivalEnteredAtMs ?? {},
  );
  // Exit tracking — needed so backward time edits can reduce committed minutes for
  // players who were substituted out. exitedAtMs = timerMs when they left;
  // exitedWithTotalMs = exact accumulated ms at exit (immutable reference).
  const [playerExitedAtMs, setPlayerExitedAtMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.playerExitedAtMs ?? {},
  );
  const [playerExitedWithTotalMs, setPlayerExitedWithTotalMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.playerExitedWithTotalMs ?? {},
  );
  const [rivalExitedAtMs, setRivalExitedAtMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.rivalExitedAtMs ?? {},
  );
  const [rivalExitedWithTotalMs, setRivalExitedWithTotalMs] = useState<Record<number, number>>(
    () => readSessionData(matchId)?.rivalExitedWithTotalMs ?? {},
  );
  const [homeTeamSelected, setHomeTeamSelected] = useState(false);
  const [rivalTeamSelected, setRivalTeamSelected] = useState(false);
  // Lineup setup (before match start — selecting starters)
  const [lineupHomeIds, setLineupHomeIds] = useState<Set<number>>(new Set());
  const [lineupRivalIds, setLineupRivalIds] = useState<Set<number>>(new Set());
  const [lineupSaving, setLineupSaving] = useState(false);
  // Timer (elapsed time per quarter, counts up)
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerMs, setTimerMs] = useState(() => {
    const s = readSessionData(matchId);
    if (s?.timerMs != null) { return s.timerMs; }
    return 0;
  });
  const [currentQuarter, setCurrentQuarter] = useState(
    () => readSessionData(matchId)?.currentQuarter ?? 1,
  );
  const timerBaseRef = useRef(readSessionData(matchId)?.timerMs ?? 0);
  const timerStartAtRef = useRef<number | null>(null);
  const [oppStatDraft, setOppStatDraft] = useState<Map<number, Partial<OpponentMatchStatUpsert>>>(new Map());
  const [oppStatSaving, setOppStatSaving] = useState<Set<number>>(new Set());
  const [showAddOppPlayer, setShowAddOppPlayer] = useState(false);
  const [oppPlayerJersey, setOppPlayerJersey] = useState("");
  const [oppPlayerName, setOppPlayerName] = useState("");
  const [oppPlayerPosition, setOppPlayerPosition] = useState("");
  const [showBulkAddOppPlayer, setShowBulkAddOppPlayer] = useState(false);
  const [bulkOppJerseys, setBulkOppJerseys] = useState("");
  // Substitution panel: null = closed, "home" = home team, "rival" = rival team
  const [showSubstitution, setShowSubstitution] = useState<"home" | "rival" | null>(null);
  // Staging: taps only preview; Confirmar commits the changes
  const [subStagedOut, setSubStagedOut] = useState<Set<number>>(new Set());
  const [subStagedIn,  setSubStagedIn]  = useState<Set<number>>(new Set());
  // Edit time dialog
  const [editTimeOpen, setEditTimeOpen] = useState(false);
  const [editTimeMin, setEditTimeMin] = useState(0);
  const [editTimeSec, setEditTimeSec] = useState(0);
  // Hold-to-repeat ref for drum picker buttons
  const holdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Next-quarter gate dialog
  const [nextQuarterOpen, setNextQuarterOpen] = useState(false);
  const [nextQuarterMsg, setNextQuarterMsg] = useState("");
  const [nextQuarterType, setNextQuarterType] = useState<"confirm" | "error">("confirm");
  // Ref to detect clicks outside the player grid (for deselect)
  const playerGridRef = useRef<HTMLDivElement>(null);
  // Per-quarter stats tracking
  const [quarterStatsLog, setQuarterStatsLog] = useState<QuarterStatEntry[]>([]);
  // Out-of-time confirmation dialog (shown when an action is attempted after the period clock reaches 0)
  const [outOfTimeDialog, setOutOfTimeDialog] = useState<{ open: boolean; label: string; onConfirm: () => void }>({ open: false, label: "", onConfirm: () => {} });

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

  // Custom stat attributes for this team
  const { data: statAttributes = [] } = useQuery<TeamStatAttribute[]>({
    queryKey: ["stat-attributes", clubId, teamId],
    queryFn: () => listStatAttributes(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
    staleTime: 5 * 60 * 1000,
  });

  // Custom match stats for this match
  const { data: customMatchStats = [], refetch: refetchCustomStats } = useQuery<CustomMatchStat[]>({
    queryKey: ["custom-match-stats", matchId],
    queryFn: () => listCustomMatchStats(token!, clubId!, teamId, matchId),
    enabled: !!token && !!clubId,
  });

  const upsertCustomStatMut = useMutation({
    mutationFn: (data: {
      stat_attribute_id: number;
      value: number;
      player_id?: number | null;
      opponent_player_id?: number | null;
    }) => upsertCustomMatchStat(token!, clubId!, teamId, matchId, data),
    onSuccess: () => void refetchCustomStats(),
  });

  // Convocatoria and rival management only editable before the match starts
  const canEditConvocatoria = isCoachOrTD && !!match && match.status === "scheduled";

  const competitionName = match?.competition_id
    ? competitions.find((c) => c.id === match.competition_id)?.name
    : null;

  const matchCompetition = match?.competition_id
    ? competitions.find((c) => c.id === match.competition_id)
    : null;

  const completedVideos = videos.filter((v) => v.status === "completed");
  const linkedVideoIds = new Set(match?.match_videos.map((mv) => mv.video_id) ?? []);
  const availableVideos = completedVideos.filter((v) => !linkedVideoIds.has(v.id));

  // Auto-navigate to estadísticas tab when opening a match already in progress
  const initialTabSetRef = useRef(false);
  useEffect(() => {
    if (!match || initialTabSetRef.current) return;
    initialTabSetRef.current = true;
    if (match.status === "in_progress") setTab("estadisticas");
    if (match.status === "finished") setTab("informe");
  }, [match]);

  // Redirect away from live-only tabs if match finishes while user is on them
  useEffect(() => {
    if (match?.status === "finished" && (tab === "estadisticas" || tab === "jugada")) setTab("informe");
  }, [match?.status, tab]);

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

  // Session storage key
  const sessionKey = `bball_match_${matchId}`;

  // Session storage — persist on each relevant state change
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      sessionStorage.setItem(sessionKey, JSON.stringify({
        homeOnCourt: Array.from(onCourtIds),
        rivalOnCourt: Array.from(onCourtOppIds),
        playerEnteredAtMs,
        rivalEnteredAtMs,
        playerExitedAtMs,
        playerExitedWithTotalMs,
        rivalExitedAtMs,
        rivalExitedWithTotalMs,
        timerMs,
        currentQuarter,
      }));
    } catch { /* ignore */ }
  }, [sessionKey, onCourtIds, onCourtOppIds, playerEnteredAtMs, rivalEnteredAtMs, playerExitedAtMs, playerExitedWithTotalMs, rivalExitedAtMs, rivalExitedWithTotalMs, timerMs, currentQuarter]);

  // Timer — auto-stops when the period ends (timerMs reaches periodDurationMs)
  const periodDurationMsRef = useRef(0); // kept current each render for use inside interval
  useEffect(() => {
    if (!timerRunning) return;
    timerStartAtRef.current = Date.now() - timerBaseRef.current;
    const id = setInterval(() => {
      const elapsed = Date.now() - timerStartAtRef.current!;
      const cap = periodDurationMsRef.current;
      if (cap > 0 && elapsed >= cap) {
        // Period has ended — clamp and stop
        setTimerMs(cap);
        timerBaseRef.current = cap;
        setTimerRunning(false);
      } else {
        setTimerMs(elapsed);
      }
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
        [{ logId, playerId: -1, playerName: "Equipo", label, statKey, delta, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
      );
      setHomeTeamSelected(false);
      return;
    }
    if (!selectedPlayerId) return;
    const mp = match.match_players.find((p) => p.player_id === selectedPlayerId);
    const playerName = mp
      ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim()
      : "Jugador";

    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: selectedPlayerId, playerName, label, statKey, delta, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
    if (statKey !== null && delta !== 0) {
      setQuarterStatsLog((prev) => [...prev, { quarter: currentQuarter, team: "home", statKey, delta, playerName }]);
    }

    if (statKey === null || delta === 0) {
      // Log-only action (miss) — still deselect so next tap picks intentionally
      setSelectedPlayerId(null);
      return;
    }

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

    // Stopped-clock: auto-pause on foul
    if (statKey === "fouls" && delta > 0 && matchCompetition?.clock_type === "stopped" && timerRunning) {
      timerBaseRef.current = timerMs;
      setTimerRunning(false);
    }

    // Auto-deselect after recording — prevents accidentally attributing the next
    // action to the same player; user must tap again to continue.
    setSelectedPlayerId(null);
  }

  const OPP_STAT_LABELS: Record<StatKey, string> = {
    points: "+Pts", assists: "AST", defensive_rebounds: "REB-D",
    offensive_rebounds: "REB-O", steals: "REC", turnovers: "PÉR", fouls: "FAL", blocks: "TAP",
  };

  function handleOppAction(statKey: StatKey | null, delta: number, overrideLabel?: string) {
    if (!match) return;
    const label = overrideLabel ?? (statKey ? (OPP_STAT_LABELS[statKey] ?? statKey) : "");
    if (rivalTeamSelected) {
      const logId = ++logCounterRef.current;
      setActionLog((prev) =>
        [{ logId, playerId: -1, playerName: "Equipo rival", label, statKey, delta, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
      );
      setRivalTeamSelected(false);
      return;
    }
    if (!selectedOppPlayerId) return;
    // Log-only for null/0 events (e.g. missed shots)
    if (statKey === null || delta === 0) {
      const oppPlayer = match.opponent_stats.find((os) => os.opponent_player_id === selectedOppPlayerId);
      const oppName = oppPlayer
        ? (oppPlayer.opponent_player.name ?? `#${oppPlayer.opponent_player.jersey_number}`)
        : "Rival";
      const logId = ++logCounterRef.current;
      setActionLog((prev) =>
        [{ logId, playerId: selectedOppPlayerId, playerName: oppName, label, statKey, delta, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
      );
      // Deselect after miss log too
      setSelectedOppPlayerId(null);
      return;
    }

    // Log rival action
    const oppPlayer = match.opponent_stats.find((os) => os.opponent_player_id === selectedOppPlayerId);
    const oppName = oppPlayer
      ? (oppPlayer.opponent_player.name ?? `#${oppPlayer.opponent_player.jersey_number}`)
      : "Rival";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: selectedOppPlayerId, playerName: oppName, label: OPP_STAT_LABELS[statKey] ?? statKey, statKey, delta, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
    setQuarterStatsLog((prev) => [...prev, { quarter: currentQuarter, team: "rival", statKey, delta, playerName: oppName }]);

    const current = oppStatDraft.get(selectedOppPlayerId) ?? { opponent_player_id: selectedOppPlayerId };
    const currentVal = ((current[statKey as keyof typeof current] ?? 0) as number);
    const newVal = Math.max(0, currentVal + delta);
    const updated = { ...current, opponent_player_id: selectedOppPlayerId, [statKey]: newVal };
    setOppStatDraft((prev) => new Map(prev).set(selectedOppPlayerId, updated));
    saveOppStatMut.mutate(updated as OpponentMatchStatUpsert);

    // Stopped-clock: auto-pause on foul
    if (statKey === "fouls" && delta > 0 && matchCompetition?.clock_type === "stopped" && timerRunning) {
      timerBaseRef.current = timerMs;
      setTimerRunning(false);
    }

    if (statKey === "points" && delta > 0) {
      const currentPlayerPts = ((current.points ?? 0) as number);
      const totalPts = Array.from(oppStatDraft.values()).reduce(
        (sum, s) => sum + ((s.points ?? 0) as number),
        0,
      );
      const newTotal = totalPts - currentPlayerPts + newVal;
      updateRivalScoreMut.mutate(newTotal);
    }

    // Auto-deselect after recording — same UX as home team actions.
    setSelectedOppPlayerId(null);
  }

  function handleUndo() {
    if (actionLog.length === 0) return;
    const last = actionLog[0];
    setActionLog((prev) => prev.slice(1));

    // Undo custom stat (both home and rival)
    if (last.customStatAttrId !== undefined && last.delta > 0 && last.playerId !== -1) {
      const existing = customMatchStats.find(
        (s) =>
          s.stat_attribute_id === last.customStatAttrId &&
          (last.team === "home" ? s.player_id === last.playerId : s.opponent_player_id === last.playerId),
      );
      const currentVal = existing?.value ?? 0;
      const newVal = Math.max(0, currentVal - last.delta);
      if (last.team === "home") {
        upsertCustomStatMut.mutate({ player_id: last.playerId, stat_attribute_id: last.customStatAttrId, value: newVal });
      } else {
        upsertCustomStatMut.mutate({ opponent_player_id: last.playerId, stat_attribute_id: last.customStatAttrId, value: newVal });
      }
      return;
    }

    // Only undo home player standard stats — rival standard stats are saved directly and not undoable here
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
    // Toggle: clicking the already-selected player deselects it
    if (selectedPlayerId === playerId) {
      setSelectedPlayerId(null);
      return;
    }
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
    // Just toggle selection — court management is via lineup/substitutions only
    setSelectedOppPlayerId((prev) => prev === oppPlayerId ? null : oppPlayerId);
  }

  // ── Click outside the player grid → deselect ────────────────────────────────
  useEffect(() => {
    if (match?.status !== "in_progress") return;
    function handleDocClick(e: MouseEvent) {
      if (playerGridRef.current && !playerGridRef.current.contains(e.target as Node)) {
        setSelectedPlayerId(null);
        setSelectedOppPlayerId(null);
        setHomeTeamSelected(false);
        setRivalTeamSelected(false);
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [match?.status]);

  // ── Minutes flush helpers ────────────────────────────────────────────────────
  // Commits the current stint of every on-court home player to sessionStats and
  // rsets their playerEnteredAtMs to `nextEnteredAtMs` (0 for quarter change,
  // newTimerMs for time edit).
  function flushHomeMins(currentTimerMs: number, nextEnteredAtMs: number) {
    if (!match?.track_home_minutes) return;
    const nextEntered: Record<number, number> = { ...playerEnteredAtMs };
    const nextStats = new Map(sessionStats);

    // ── On-court players: open-ended stint ──────────────────────────────────────
    Array.from(onCourtIds).forEach((pid) => {
      if (playerEnteredAtMs[pid] == null) return;
      // Use raw delta (can be negative on backward edits) added to already-committed
      // minutes so that time edits in either direction produce the correct total.
      const rawStintMs = currentTimerMs - playerEnteredAtMs[pid];
      const existingMin = (nextStats.get(pid)?.minutes ?? 0) as number;
      const totalMs = Math.max(0, existingMin * 60000 + rawStintMs);
      const newMin = Math.floor(totalMs / 60000);
      const remainderMs = totalMs % 60000;
      if (newMin !== existingMin) {
        const updated = { ...(nextStats.get(pid) ?? { player_id: pid }), minutes: newMin };
        nextStats.set(pid, updated);
        upsertStatMut.mutate(updated);
      }
      // Carry sub-minute remainder forward so seconds are never lost across
      // quarter advances or time edits.
      nextEntered[pid] = nextEnteredAtMs - remainderMs;
    });

    // ── Off-court players (substituted out): bounded stint ──────────────────────
    // playerExitedWithTotalMs[pid] is the exact ms at exit (immutable) so the
    // formula is idempotent regardless of how many forward/backward edits follow.
    Object.keys(playerExitedAtMs).forEach((pidStr) => {
      const pid = Number(pidStr);
      if (onCourtIds.has(pid)) return; // handled above
      const exitTime = playerExitedAtMs[pid];
      const totalAtExit = playerExitedWithTotalMs[pid] ?? 0;
      // Time accrual is capped at the exit point; backward edits can reduce it.
      const targetMs = Math.max(0, totalAtExit + Math.min(0, currentTimerMs - exitTime));
      const newMin = Math.floor(targetMs / 60000);
      const existingMin = (nextStats.get(pid)?.minutes ?? 0) as number;
      if (newMin !== existingMin) {
        const updated = { ...(nextStats.get(pid) ?? { player_id: pid }), minutes: newMin };
        nextStats.set(pid, updated);
        upsertStatMut.mutate(updated);
      }
    });

    setSessionStats(nextStats);
    setPlayerEnteredAtMs(nextEntered);
  }

  function flushRivalMins(currentTimerMs: number, nextEnteredAtMs: number) {
    if (!match?.track_rival_minutes) return;
    const nextEntered: Record<number, number> = { ...rivalEnteredAtMs };

    // ── On-court rival players: open-ended stint ─────────────────────────────────
    Array.from(onCourtOppIds).forEach((pid) => {
      if (rivalEnteredAtMs[pid] == null) return;
      const rawStintMs = currentTimerMs - rivalEnteredAtMs[pid];
      const current = oppStatDraft.get(pid) ?? { opponent_player_id: pid };
      const existingMin = (current.minutes ?? 0) as number;
      const totalMs = Math.max(0, existingMin * 60000 + rawStintMs);
      const newMin = Math.floor(totalMs / 60000);
      const remainderMs = totalMs % 60000;
      if (newMin !== existingMin) {
        const updated = { ...current, minutes: newMin };
        setOppStatDraft((prev) => new Map(prev).set(pid, updated));
        saveOppStatMut.mutate(updated as OpponentMatchStatUpsert);
      }
      nextEntered[pid] = nextEnteredAtMs - remainderMs;
    });

    // ── Off-court rival players: bounded stint ───────────────────────────────────
    Object.keys(rivalExitedAtMs).forEach((pidStr) => {
      const pid = Number(pidStr);
      if (onCourtOppIds.has(pid)) return;
      const exitTime = rivalExitedAtMs[pid];
      const totalAtExit = rivalExitedWithTotalMs[pid] ?? 0;
      const targetMs = Math.max(0, totalAtExit + Math.min(0, currentTimerMs - exitTime));
      const newMin = Math.floor(targetMs / 60000);
      const current = oppStatDraft.get(pid) ?? { opponent_player_id: pid };
      const existingMin = (current.minutes ?? 0) as number;
      if (newMin !== existingMin) {
        const updated = { ...current, minutes: newMin };
        setOppStatDraft((prev) => new Map(prev).set(pid, updated));
        saveOppStatMut.mutate(updated as OpponentMatchStatUpsert);
      }
    });

    setRivalEnteredAtMs(nextEntered);
  }

  // ── Next-quarter advance ─────────────────────────────────────────────────────
  function doNextQuarter() {
    flushHomeMins(timerMs, 0);
    flushRivalMins(timerMs, 0);
    // Exit records are period-scoped: clear them so Q2 edits don't touch Q1 players
    setPlayerExitedAtMs({});
    setPlayerExitedWithTotalMs({});
    setRivalExitedAtMs({});
    setRivalExitedWithTotalMs({});
    timerBaseRef.current = 0;
    setTimerMs(0);
    setTimerRunning(false);
    setCurrentQuarter((q) => q + 1);
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
  // Keep ref current so the timer interval can read it without stale closure
  periodDurationMsRef.current = periodDurationMs;
  const remainingMs = Math.max(0, periodDurationMs - timerMs);
  // True when the period clock has reached 0 (timer naturally expired or edited to 0)
  const periodEnded = remainingMs === 0 && timerMs > 0;
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

  // Guard: if period has ended, wrap action in an out-of-time confirmation dialog
  function withOutOfTimeGuard(actionLabel: string, action: () => void) {
    if (periodEnded) {
      setOutOfTimeDialog({ open: true, label: actionLabel, onConfirm: action });
    } else {
      action();
    }
  }

  // ── Substitution helpers ─────────────────────────────────────────────────

  function execSubOutHome(pid: number) {
    if (match!.track_home_minutes && playerEnteredAtMs[pid] != null) {
      const existingMin = (sessionStats.get(pid)?.minutes ?? 0) as number;
      const rawStintMs = timerMs - playerEnteredAtMs[pid];
      const totalAtExit = Math.max(0, existingMin * 60000 + rawStintMs);
      const newMin = Math.floor(totalAtExit / 60000);
      if (newMin !== existingMin) {
        setSessionStats((prev) => {
          const next = new Map(prev);
          next.set(pid, { ...(next.get(pid) ?? { player_id: pid }), minutes: newMin });
          return next;
        });
        upsertStatMut.mutate({ player_id: pid, minutes: newMin });
      }
      setPlayerExitedAtMs((prev) => ({ ...prev, [pid]: timerMs }));
      setPlayerExitedWithTotalMs((prev) => ({ ...prev, [pid]: totalAtExit }));
      setPlayerEnteredAtMs((prev) => { const next = { ...prev }; delete next[pid]; return next; });
    }
    setOnCourtIds((prev) => { const n = new Set(prev); n.delete(pid); return n; });
    const mp = match!.match_players.find((m) => m.player_id === pid);
    const name = mp ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim() : "Jugador";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: pid, playerName: name, label: "↓ salió", statKey: null, delta: 0, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
  }

  function execSubInHome(pid: number) {
    setPlayerEnteredAtMs((prev) => ({ ...prev, [pid]: timerMs }));
    setOnCourtIds((prev) => { const n = new Set(prev); n.add(pid); return n; });
    const mp = match!.match_players.find((m) => m.player_id === pid);
    const name = mp ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim() : "Jugador";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: pid, playerName: name, label: "↑ entró", statKey: null, delta: 0, team: "home" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
  }

  function tapCourtPlayerHome(pid: number) {
    // Toggle staged-out: tap again to unstage
    setSubStagedOut((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }

  function tapBenchPlayerHome(pid: number) {
    setSubStagedIn((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) { n.delete(pid); return n; } // already staged → unstage
      // Only allow staging in if there's room after the staged changes
      const effectiveSize = onCourtIds.size - subStagedOut.size + n.size;
      if (effectiveSize < 5) { n.add(pid); }
      return n;
    });
  }

  function execSubOutRival(pid: number) {
    if (match!.track_rival_minutes && rivalEnteredAtMs[pid] != null) {
      const current = oppStatDraft.get(pid) ?? { opponent_player_id: pid };
      const existingMin = (current.minutes ?? 0) as number;
      const rawStintMs = timerMs - rivalEnteredAtMs[pid];
      const totalAtExit = Math.max(0, existingMin * 60000 + rawStintMs);
      const newMin = Math.floor(totalAtExit / 60000);
      if (newMin !== existingMin) {
        setOppStatDraft((prev) => new Map(prev).set(pid, { ...current, minutes: newMin }));
        saveOppStatMut.mutate({ ...(current as OpponentMatchStatUpsert), minutes: newMin });
      }
      setRivalExitedAtMs((prev) => ({ ...prev, [pid]: timerMs }));
      setRivalExitedWithTotalMs((prev) => ({ ...prev, [pid]: totalAtExit }));
      setRivalEnteredAtMs((prev) => { const next = { ...prev }; delete next[pid]; return next; });
    }
    setOnCourtOppIds((prev) => { const n = new Set(prev); n.delete(pid); return n; });
    const os = match!.opponent_stats.find((s) => s.opponent_player_id === pid);
    const name = os ? (os.opponent_player.name ?? `#${os.opponent_player.jersey_number}`) : "Rival";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: pid, playerName: name, label: "↓ salió", statKey: null, delta: 0, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
  }

  function execSubInRival(pid: number) {
    setRivalEnteredAtMs((prev) => ({ ...prev, [pid]: timerMs }));
    setOnCourtOppIds((prev) => { const n = new Set(prev); n.add(pid); return n; });
    const os = match!.opponent_stats.find((s) => s.opponent_player_id === pid);
    const name = os ? (os.opponent_player.name ?? `#${os.opponent_player.jersey_number}`) : "Rival";
    const logId = ++logCounterRef.current;
    setActionLog((prev) =>
      [{ logId, playerId: pid, playerName: name, label: "↑ entró", statKey: null, delta: 0, team: "rival" as const, quarter: currentQuarter }, ...prev].slice(0, 500),
    );
  }

  function tapCourtPlayerRival(pid: number) {
    setSubStagedOut((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) n.delete(pid); else n.add(pid);
      return n;
    });
  }

  function tapBenchPlayerRival(pid: number) {
    setSubStagedIn((prev) => {
      const n = new Set(prev);
      if (n.has(pid)) { n.delete(pid); return n; }
      const effectiveSize = onCourtOppIds.size - subStagedOut.size + n.size;
      if (effectiveSize < 5) { n.add(pid); }
      return n;
    });
  }

  function confirmSubstitutions() {
    const doConfirm = () => {
      if (showSubstitution === "home") {
        subStagedOut.forEach((pid) => execSubOutHome(pid));
        subStagedIn.forEach((pid) => execSubInHome(pid));
      } else {
        subStagedOut.forEach((pid) => execSubOutRival(pid));
        subStagedIn.forEach((pid) => execSubInRival(pid));
      }
      setShowSubstitution(null);
      setSubStagedOut(new Set());
      setSubStagedIn(new Set());
    };
    withOutOfTimeGuard("Sustitución", doConfirm);
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
  const rosterJerseyMap = new Map(roster.map((re) => [re.player_id, re.jersey_number]));

  const dateStr = new Date(match.date).toLocaleDateString("es-ES", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = new Date(match.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  const isTransitioning = startMut.isPending || finishMut.isPending;

  // ── Sorted player lists for live scoring columns ─────────────────────────────
  // Always sort by jersey. When tracking minutes, only on-court players are shown.
  const liveHomePlayers = match
    ? (match.track_home_minutes
        ? match.match_players.filter((mp) => onCourtIds.has(mp.player_id))
        : [...match.match_players]
      ).sort((a, b) => {
        const aExcl = ((sessionStats.get(a.player_id)?.fouls ?? 0) as number) >= 5;
        const bExcl = ((sessionStats.get(b.player_id)?.fouls ?? 0) as number) >= 5;
        if (aExcl !== bExcl) return aExcl ? 1 : -1;
        return (rosterJerseyMap.get(a.player_id) ?? 999) - (rosterJerseyMap.get(b.player_id) ?? 999);
      })
    : [];
  const liveOppStats = match
    ? [...match.opponent_stats].sort((a, b) => {
        const aExcl = ((oppStatDraft.get(a.opponent_player_id)?.fouls ?? 0) as number) >= 5;
        const bExcl = ((oppStatDraft.get(b.opponent_player_id)?.fouls ?? 0) as number) >= 5;
        if (aExcl !== bExcl) return aExcl ? 1 : -1;
        return (a.opponent_player.jersey_number ?? 999) - (b.opponent_player.jersey_number ?? 999);
      })
    : [];

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

          {/* Finalizar partido — solo visible en el último cuarto o prórroga */}
          {isCoachOrTD && match.status === "in_progress" && currentQuarter >= regularQuarters && (
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
        <div className="flex items-center gap-1 border-b mb-6 flex-wrap">
          {(["convocatoria", "rival", "estadisticas", "informe", "jugada", "videos"] as TabKey[]).map((t) => {
            // Informe and jugada only visible once match has started
            if ((t === "informe" || t === "jugada") && match.status === "scheduled") return null;
            // Estadisticas and jugada hidden for finished matches (live-only data)
            if ((t === "estadisticas" || t === "jugada") && match.status === "finished") return null;
            return (
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
                {t === "informe" && "Informe"}
                {t === "jugada" && "Jugada a jugada"}
                {t === "videos" && "Vídeo"}
              </button>
            );
          })}
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
                  {[...match.match_players].sort((a, b) => (rosterJerseyMap.get(a.player_id) ?? 999) - (rosterJerseyMap.get(b.player_id) ?? 999)).map((mp) => {
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
                      {[...match.opponent_stats].sort((a, b) => (a.opponent_player.jersey_number ?? 999) - (b.opponent_player.jersey_number ?? 999)).map((os) => (
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
                      {[...match.match_players]
                        .sort((a, b) => {
                          const aChecked = homeStartersConfirmed ? a.is_starter : lineupHomeIds.has(a.player_id);
                          const bChecked = homeStartersConfirmed ? b.is_starter : lineupHomeIds.has(b.player_id);
                          if (aChecked !== bChecked) return aChecked ? -1 : 1;
                          return (rosterJerseyMap.get(a.player_id) ?? 999) - (rosterJerseyMap.get(b.player_id) ?? 999);
                        })
                        .map((mp) => {
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
                      {[...match.opponent_stats]
                        .sort((a, b) => {
                          const aChecked = rivalStartersConfirmed ? a.is_starter : lineupRivalIds.has(a.opponent_player_id);
                          const bChecked = rivalStartersConfirmed ? b.is_starter : lineupRivalIds.has(b.opponent_player_id);
                          if (aChecked !== bChecked) return aChecked ? -1 : 1;
                          return (a.opponent_player.jersey_number ?? 999) - (b.opponent_player.jersey_number ?? 999);
                        })
                        .map((os) => {
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
                {/* ── Control del partido ── */}
                <div className="border rounded-lg bg-muted/20 overflow-hidden">
                  {/* Fila 1: Cuarto */}
                  <div className="flex items-center justify-between px-4 py-2.5 border-b">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Periodo</p>
                      <span className={cn(
                        "text-xs font-bold rounded px-2 py-0.5",
                        isOT ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" : "bg-muted text-foreground"
                      )}>
                        {quarterLabel} / {regularQuarters}Q
                      </span>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() => {
                        const goingToOT = currentQuarter === regularQuarters;
                        // OT requires tied score
                        if (goingToOT) {
                          const hs = match.our_score;
                          const rs = match.their_score;
                          if (hs != null && rs != null && hs !== rs) {
                            setNextQuarterMsg("La prórroga solo es posible con el marcador empatado. Ajusta el resultado antes de continuar.");
                            setNextQuarterType("error");
                            setNextQuarterOpen(true);
                            return;
                          }
                        }
                        // Timer still running — ask for confirmation
                        if (remainingMs > 0) {
                          setNextQuarterMsg(
                            goingToOT
                              ? `Quedan ${timerDisplay} en el ${quarterLabel}. ¿Avanzar a prórroga igualmente?`
                              : `Quedan ${timerDisplay} en el ${quarterLabel}. ¿Avanzar al siguiente periodo igualmente?`
                          );
                          setNextQuarterType("confirm");
                          setNextQuarterOpen(true);
                          return;
                        }
                        doNextQuarter();
                      }}
                    >
                      {currentQuarter < regularQuarters
                        ? `Q${currentQuarter + 1}`
                        : currentQuarter === regularQuarters
                        ? "Prórroga"
                        : `OT${currentQuarter - regularQuarters + 1}`}
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {/* Fila 2: Timer */}
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className={cn(
                      "font-mono text-3xl font-bold tabular-nums tracking-tight",
                      remainingMs < 60000 && remainingMs > 0 ? "text-orange-500" : remainingMs === 0 ? "text-red-500" : ""
                    )}>
                      {timerDisplay}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant={timerRunning ? "default" : "outline"}
                        className="h-8 gap-1.5 text-xs"
                        disabled={periodEnded}
                        onClick={() => {
                          if (timerRunning) {
                            timerBaseRef.current = timerMs;
                            setTimerRunning(false);
                          } else {
                            setTimerRunning(true);
                          }
                        }}
                      >
                        {timerRunning
                          ? <><Pause className="h-3 w-3" />Pausar</>
                          : periodEnded
                          ? <><CheckCircle className="h-3 w-3" />Finalizado</>
                          : <><Play className="h-3 w-3" />{timerMs > 0 ? "Reanudar" : "Iniciar"}</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-xs"
                        title="Editar tiempo manualmente"
                        onClick={() => {
                          // Auto-pause timer when opening the edit dialog
                          if (timerRunning) {
                            timerBaseRef.current = timerMs;
                            setTimerRunning(false);
                          }
                          const totalSec = Math.floor(remainingMs / 1000);
                          setEditTimeMin(Math.floor(totalSec / 60));
                          setEditTimeSec(totalSec % 60);
                          setEditTimeOpen(true);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* ── Panel de sustitución — diseño visual de dos listas ── */}
                {showSubstitution !== null && (() => {
                  const isHome = showSubstitution === "home";
                  const teamLabel = isHome ? (activeProfile?.team_name ?? "Local") : (opponentTeam?.name ?? match.opponent_name);
                  const courtIds   = isHome ? onCourtIds : onCourtOppIds;

                  // Build sorted player rows for home
                  const homePlayers = [...match.match_players].sort(
                    (a, b) => (rosterJerseyMap.get(a.player_id) ?? 999) - (rosterJerseyMap.get(b.player_id) ?? 999),
                  );
                  const rivalPlayers = [...match.opponent_stats].sort(
                    (a, b) => (a.opponent_player.jersey_number ?? 999) - (b.opponent_player.jersey_number ?? 999),
                  );

                  const courtPlayers = isHome
                    ? homePlayers.filter((p) => courtIds.has(p.player_id))
                    : rivalPlayers.filter((p) => courtIds.has(p.opponent_player_id));
                  const benchPlayers = isHome
                    ? homePlayers.filter((p) => !courtIds.has(p.player_id))
                    : rivalPlayers.filter((p) => !courtIds.has(p.opponent_player_id));

                  // Helper to get id/jersey/name/photo for each row
                  const rowId = (p: typeof courtPlayers[number]) =>
                    isHome ? (p as typeof homePlayers[number]).player_id : (p as typeof rivalPlayers[number]).opponent_player_id;
                  const rowJersey = (p: typeof courtPlayers[number]) =>
                    isHome
                      ? rosterJerseyMap.get((p as typeof homePlayers[number]).player_id)
                      : (p as typeof rivalPlayers[number]).opponent_player.jersey_number;
                  const rowName = (p: typeof courtPlayers[number]) => {
                    if (isHome) {
                      const hp = p as typeof homePlayers[number];
                      return `${hp.player_first_name ?? ""} ${hp.player_last_name ?? ""}`.trim() || "—";
                    }
                    const rp = p as typeof rivalPlayers[number];
                    return rp.opponent_player.name ?? "—";
                  };
                  const rowPhoto = (p: typeof courtPlayers[number]) =>
                    isHome ? rosterPhotoMap.get((p as typeof homePlayers[number]).player_id) : null;

                  // Card for a single player
                  const PlayerCard = ({
                    p,
                    zone,
                  }: {
                    p: typeof courtPlayers[number];
                    zone: "court" | "bench";
                  }) => {
                    const pid  = rowId(p);
                    const jsy  = rowJersey(p);
                    const name = rowName(p);
                    const photo = rowPhoto(p);
                    const isStagedOut = subStagedOut.has(pid);
                    const isStagedIn  = subStagedIn.has(pid);
                    const isDisabled  = false; // staging always allows re-toggle

                    const initials = name
                      .split(" ")
                      .filter(Boolean)
                      .slice(0, 2)
                      .map((w) => w[0].toUpperCase())
                      .join("");

                    return (
                      <button
                        key={pid}
                        disabled={isDisabled}
                        onClick={() => {
                          if (zone === "court") {
                            if (isHome) tapCourtPlayerHome(pid); else tapCourtPlayerRival(pid);
                          } else {
                            if (isHome) tapBenchPlayerHome(pid); else tapBenchPlayerRival(pid);
                          }
                        }}
                        className={cn(
                          "flex items-center gap-2 w-full rounded-lg px-2 py-1.5 text-left transition-colors",
                          "border",
                          zone === "court"
                            ? isStagedOut
                              ? "border-destructive/50 bg-destructive/10 cursor-pointer"
                              : "border-transparent hover:bg-destructive/10 hover:border-destructive/30 cursor-pointer"
                            : isStagedIn
                            ? "border-green-500/50 bg-green-500/10 cursor-pointer"
                            : "border-transparent hover:bg-primary/10 hover:border-primary/30 cursor-pointer",
                        )}
                      >
                        {/* Avatar */}
                        <div className="relative shrink-0">
                          {photo ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo}
                              alt={name}
                              className="h-8 w-8 rounded-full object-cover border border-border"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground border border-border">
                              {initials || "?"}
                            </div>
                          )}
                          {jsy != null && (
                            <span className="absolute -bottom-0.5 -right-0.5 text-[9px] font-bold bg-background border border-border rounded-full px-1 leading-tight">
                              {jsy}
                            </span>
                          )}
                        </div>
                        {/* Name */}
                        <span className="flex-1 text-xs font-medium truncate leading-tight">
                          {name}
                        </span>
                        {/* Badge */}
                        {zone === "court" && isStagedOut && (
                          <span className="shrink-0 text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-destructive/15 text-destructive">
                            saldrá
                          </span>
                        )}
                        {zone === "bench" && isStagedIn && (
                          <span className="shrink-0 text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-green-500/15 text-green-700 dark:text-green-400">
                            entrará
                          </span>
                        )}
                        {/* Arrow hint when not staged */}
                        {zone === "court" && !isStagedOut && (
                          <span className="shrink-0 text-muted-foreground/30 text-xs">↓</span>
                        )}
                        {zone === "bench" && !isStagedIn && (
                          <span className="shrink-0 text-muted-foreground/30 text-xs">↑</span>
                        )}
                      </button>
                    );
                  };

                  return (
                    <div className="border rounded-lg bg-accent/5 overflow-hidden">
                      {/* Header */}
                      <div className="flex items-center justify-between px-4 py-2 border-b bg-background/60">
                        <div className="flex items-center gap-2">
                          <ArrowLeftRight className="h-3.5 w-3.5 text-muted-foreground" />
                          <p className="text-xs font-semibold">
                            Cambio — <span className="text-muted-foreground">{teamLabel}</span>
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {subStagedOut.size > subStagedIn.size && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              Selecciona quién entra
                            </span>
                          )}
                        {subStagedIn.size > subStagedOut.size && (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                              Selecciona quién sale
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => {
                              setShowSubstitution(null);
                              setSubStagedOut(new Set());
                              setSubStagedIn(new Set());
                            }}
                          >
                            <span className="text-xs">✕</span>
                          </Button>
                        </div>
                      </div>
                      {/* Two columns */}
                      <div className="grid grid-cols-2 divide-x">
                        {/* En pista */}
                        <div className="p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
                            En pista ({courtPlayers.length})
                          </p>
                          <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-0.5">
                            {courtPlayers.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground px-1 py-2">Sin jugadores</p>
                            ) : (
                              courtPlayers.map((p) => (
                                <PlayerCard key={rowId(p)} p={p} zone="court" />
                              ))
                            )}
                          </div>
                        </div>
                        {/* Banquillo */}
                        <div className="p-2">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1 mb-1.5">
                            Banquillo ({benchPlayers.length})
                          </p>
                          <div className="space-y-0.5 max-h-[260px] overflow-y-auto pr-0.5">
                            {benchPlayers.length === 0 ? (
                              <p className="text-[11px] text-muted-foreground px-1 py-2">Sin jugadores</p>
                            ) : (
                              benchPlayers.map((p) => (
                                <PlayerCard key={rowId(p)} p={p} zone="bench" />
                              ))
                            )}
                          </div>
                        </div>
                      </div>
                      {/* Footer: hint + Confirmar */}
                      <div className="px-3 py-2 border-t bg-background/40 flex items-center justify-between gap-3">
                        <span className="text-[10px] text-muted-foreground">
                          Toca para marcar · Toca de nuevo para desmarcar
                        </span>
                        <Button
                          size="sm"
                          className="h-7 text-xs shrink-0"
                          disabled={subStagedOut.size === 0 && subStagedIn.size === 0}
                          onClick={confirmSubstitutions}
                        >
                          Confirmar{(subStagedOut.size > 0 || subStagedIn.size > 0)
                            ? ` (${subStagedOut.size}↓ ${subStagedIn.size}↑)`
                            : ""}
                        </Button>
                      </div>
                    </div>
                  );
                })()}

                {/* ── 3 columnas: local | acciones | rival ── */}
                <div ref={playerGridRef} className="grid gap-3" style={{ gridTemplateColumns: "220px 1fr 220px" }}>

                  {/* Columna izquierda: jugadores locales */}
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">
                      {activeProfile?.team_name ?? "Local"}
                    </p>
                    {liveHomePlayers.map((mp) => {
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
                          onClick={() => { if (!isExcluded) handlePlayerClick(mp.player_id); }}
                          className={cn(
                            "w-full text-left rounded-lg p-2 transition-all border",
                            isSelected
                              ? "border-primary bg-primary text-primary-foreground shadow-md"
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
                              <span className={cn("text-[10px] leading-none mt-0.5 block", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                {pts}p · {ast}a · {reb}r
                              </span>
                            </div>
                            {/* Foul indicator — escalating visual weight */}
                            <div className="shrink-0 w-8 flex flex-col items-center justify-center">
                              {fal >= 5 ? (
                                <span className="text-[9px] font-bold bg-red-500 text-white rounded px-1 py-px leading-none">EXCL</span>
                              ) : fal === 4 ? (
                                <div className="flex flex-col items-center gap-px">
                                  <span className={cn("text-base font-black leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>{fal}</span>
                                  <span className={cn("text-[8px] font-bold leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>F ⚠</span>
                                </div>
                              ) : fal === 3 ? (
                                <span className={cn("text-sm font-bold leading-none", isSelected ? "text-amber-200" : "text-amber-500")}>{fal}F</span>
                              ) : fal === 2 ? (
                                <span className={cn("text-xs font-semibold leading-none", isSelected ? "text-primary-foreground/60" : "text-muted-foreground")}>{fal}F</span>
                              ) : fal === 1 ? (
                                <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/40" : "text-muted-foreground/60")}>{fal}F</span>
                              ) : null}
                            </div>
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
                    {/* Botón cambio local — solo si se controla el tiempo */}
                    {match.track_home_minutes && (
                      <Button
                        size="sm"
                        variant={showSubstitution === "home" ? "default" : "outline"}
                        className="w-full h-8 gap-1.5 text-xs mt-1"
                        onClick={() => {
                          if (showSubstitution === "home") {
                            setShowSubstitution(null);
                          } else {
                            setShowSubstitution("home");
                            setSubStagedOut(new Set());
                            setSubStagedIn(new Set());
                          }
                        }}
                      >
                        <ArrowLeftRight className="h-3 w-3" />
                        Cambio
                      </Button>
                    )}
                  </div>

                  {/* Columna central: pad de acciones */}
                  <div className="space-y-2">
                    {/* Indicador jugador activo */}
                    {(() => {
                      const homeActive = selectedPlayerId !== null || homeTeamSelected;
                      const rivalActive = selectedOppPlayerId !== null || rivalTeamSelected;
                      const anyActive = homeActive || rivalActive;
                      let label: React.ReactNode = <span className="text-muted-foreground text-xs">Selecciona un jugador o equipo</span>;
                      if (homeTeamSelected) label = "Equipo";
                      else if (rivalTeamSelected) label = "Equipo rival";
                      else if (selectedPlayerId !== null) {
                        const mp = match.match_players.find((p) => p.player_id === selectedPlayerId);
                        label = mp ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim() : "";
                      } else if (selectedOppPlayerId !== null) {
                        const os = match.opponent_stats.find((o) => o.opponent_player_id === selectedOppPlayerId);
                        label = os
                          ? (os.opponent_player.name ? `#${os.opponent_player.jersey_number} ${os.opponent_player.name}` : `#${os.opponent_player.jersey_number}`)
                          : "";
                      }
                      return (
                        <div className={cn(
                          "flex items-center border rounded-lg px-3 py-2 min-h-[38px]",
                          anyActive ? "bg-accent/20" : "text-muted-foreground",
                        )}>
                          {/* Left: home team arrow */}
                          <div className="w-20 shrink-0 flex items-center gap-1">
                            {homeActive && (
                              <>
                                <span className="text-primary font-bold text-base leading-none">◀</span>
                                <span className="text-[10px] font-semibold text-primary leading-tight truncate">
                                  {activeProfile?.team_name ?? "Local"}
                                </span>
                              </>
                            )}
                          </div>
                          {/* Center: player name */}
                          <div className="flex-1 text-center text-sm font-medium truncate">{label}</div>
                          {/* Right: rival team arrow */}
                          <div className="w-20 shrink-0 flex items-center justify-end gap-1">
                            {rivalActive && (
                              <>
                                <span className="text-[10px] font-semibold text-primary leading-tight truncate">
                                  {opponentTeam?.name ?? match.opponent_name}
                                </span>
                                <span className="text-primary font-bold text-base leading-none">▶</span>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {(selectedPlayerId !== null || homeTeamSelected || selectedOppPlayerId !== null || rivalTeamSelected) ? (
                      <div className="space-y-1.5">
                        <div className="grid grid-cols-3 gap-1.5">
                          <ActionButton label="+2P" sublabel="Canasta 2P" onClick={() => withOutOfTimeGuard("Canasta 2P", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 2, "+2P"); else handleOppAction("points", 2); })} colorClass="bg-green-500 hover:bg-green-600 active:bg-green-700 text-white" />
                          <ActionButton label="+3P" sublabel="Canasta 3P" onClick={() => withOutOfTimeGuard("Canasta 3P", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 3, "+3P"); else handleOppAction("points", 3); })} colorClass="bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white" />
                          <ActionButton label="+TL" sublabel="Tiro libre" onClick={() => withOutOfTimeGuard("Tiro libre", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("points", 1, "+1 TL"); else handleOppAction("points", 1); })} colorClass="bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white" />
                        </div>
                        <div className="grid grid-cols-3 gap-1.5">
                          <ActionButton label="×2P" sublabel="Fallo 2P" onClick={() => withOutOfTimeGuard("Fallo 2P", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo 2P"); else handleOppAction(null, 0, "Fallo 2P"); })} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                          <ActionButton label="×3P" sublabel="Fallo 3P" onClick={() => withOutOfTimeGuard("Fallo 3P", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo 3P"); else handleOppAction(null, 0, "Fallo 3P"); })} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                          <ActionButton label="×TL" sublabel="Fallo TL" onClick={() => withOutOfTimeGuard("Fallo TL", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction(null, 0, "Fallo TL"); else handleOppAction(null, 0, "Fallo TL"); })} colorClass="bg-muted hover:bg-muted/80 text-muted-foreground" />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <ActionButton label="REB-O" sublabel="Ofensivo" onClick={() => withOutOfTimeGuard("Rebote ofensivo", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("offensive_rebounds", 1, "REB-O"); else handleOppAction("offensive_rebounds", 1); })} colorClass="bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white" />
                          <ActionButton label="REB-D" sublabel="Defensivo" onClick={() => withOutOfTimeGuard("Rebote defensivo", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("defensive_rebounds", 1, "REB-D"); else handleOppAction("defensive_rebounds", 1); })} colorClass="bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white" />
                        </div>
                        <div className="grid grid-cols-5 gap-1.5">
                          <ActionButton label="AST" sublabel="Asistencia" onClick={() => withOutOfTimeGuard("Asistencia", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("assists", 1, "Asistencia"); else handleOppAction("assists", 1); })} colorClass="bg-purple-500 hover:bg-purple-600 active:bg-purple-700 text-white" />
                          <ActionButton label="REC" sublabel="Recuperación" onClick={() => withOutOfTimeGuard("Recuperación", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("steals", 1, "Recuperación"); else handleOppAction("steals", 1); })} colorClass="bg-orange-500 hover:bg-orange-600 active:bg-orange-700 text-white" />
                          <ActionButton label="TAP" sublabel="Tapón" onClick={() => withOutOfTimeGuard("Tapón", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("blocks", 1, "Tapón"); else handleOppAction("blocks", 1); })} colorClass="bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white" />
                          <ActionButton label="PÉR" sublabel="Pérdida" onClick={() => withOutOfTimeGuard("Pérdida", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("turnovers", 1, "Pérdida"); else handleOppAction("turnovers", 1); })} colorClass="bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white" />
                          <ActionButton label="FAL" sublabel="Falta" onClick={() => withOutOfTimeGuard("Falta", () => { if (selectedPlayerId !== null || homeTeamSelected) handleAction("fouls", 1, "Falta"); else handleOppAction("fouls", 1); })} colorClass="bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-black" />
                        </div>
                        {/* ── Estadísticas personalizadas ── */}
                        {statAttributes.length > 0 && (selectedPlayerId !== null || selectedOppPlayerId !== null) && (() => {
                          const isHome = selectedPlayerId !== null;
                          const cols = statAttributes.length <= 3 ? statAttributes.length : Math.ceil(statAttributes.length / Math.ceil(statAttributes.length / 3));
                          return (
                            <div className="border-t pt-1.5 space-y-1">
                              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider px-0.5">Stats personalizadas</p>
                              <div className={`grid gap-1.5`} style={{ gridTemplateColumns: `repeat(${Math.min(statAttributes.length, 3)}, 1fr)` }}>
                                {statAttributes.map((attr) => {
                                  const current = isHome
                                    ? (customMatchStats.find(s => s.player_id === selectedPlayerId && s.stat_attribute_id === attr.id)?.value ?? 0)
                                    : (customMatchStats.find(s => s.opponent_player_id === selectedOppPlayerId && s.stat_attribute_id === attr.id)?.value ?? 0);
                                  const btnLabel = `+${attr.short_name ?? attr.name}`;
                                  const colorClass = CUSTOM_STAT_COLOR_MAP[attr.color ?? ""] ?? "bg-violet-500 hover:bg-violet-600 active:bg-violet-700 text-white";
                                  return (
                                    <ActionButton
                                      key={attr.id}
                                      label={btnLabel}
                                      sublabel={current > 0 ? `${current} registrados` : attr.name}
                                      onClick={() => {
                                        const newVal = current + 1;
                                        const logLabel = attr.short_name ?? attr.name;
                                        const logId = ++logCounterRef.current;
                                        if (isHome) {
                                          const mp = match?.match_players.find((p) => p.player_id === selectedPlayerId);
                                          const playerName = mp ? `${mp.player_first_name ?? ""} ${mp.player_last_name ?? ""}`.trim() : "Jugador";
                                          setActionLog((prev) =>
                                            [{ logId, playerId: selectedPlayerId!, playerName, label: logLabel, statKey: null, delta: 1, team: "home" as const, quarter: currentQuarter, customStatAttrId: attr.id }, ...prev].slice(0, 500),
                                          );
                                          upsertCustomStatMut.mutate({ player_id: selectedPlayerId, stat_attribute_id: attr.id, value: newVal });
                                          setSelectedPlayerId(null);
                                        } else {
                                          const oppPlayer = match?.opponent_stats.find((os) => os.opponent_player_id === selectedOppPlayerId);
                                          const oppName = oppPlayer
                                            ? (oppPlayer.opponent_player.name ?? `#${oppPlayer.opponent_player.jersey_number}`)
                                            : "Rival";
                                          setActionLog((prev) =>
                                            [{ logId, playerId: selectedOppPlayerId!, playerName: oppName, label: logLabel, statKey: null, delta: 1, team: "rival" as const, quarter: currentQuarter, customStatAttrId: attr.id }, ...prev].slice(0, 500),
                                          );
                                          upsertCustomStatMut.mutate({ opponent_player_id: selectedOppPlayerId, stat_attribute_id: attr.id, value: newVal });
                                          setSelectedOppPlayerId(null);
                                        }
                                      }}
                                      colorClass={colorClass}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
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
                              {/* Directional arrow */}
                              {entry.team === "home" ? (
                                <div className="flex items-center gap-0.5 shrink-0 w-[72px]">
                                  <span className="text-primary font-bold text-sm leading-none">◀</span>
                                  <span className="text-[9px] font-semibold text-primary leading-tight truncate">
                                    {activeProfile?.team_name ?? "Local"}
                                  </span>
                                </div>
                              ) : entry.team === "rival" ? (
                                <div className="flex items-center gap-0.5 shrink-0 w-[72px] justify-end">
                                  <span className="text-[9px] font-semibold text-orange-500 leading-tight truncate">
                                    {opponentTeam?.name ?? match.opponent_name}
                                  </span>
                                  <span className="text-orange-500 font-bold text-sm leading-none">▶</span>
                                </div>
                              ) : (
                                <div className="w-[72px] shrink-0" />
                              )}
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
                          {opponentTeam?.name ?? match.opponent_name}
                        </p>
                        {liveOppStats.map((os) => {
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
                              onClick={() => { if (!oppExcluded) handleOppPlayerClick(os.opponent_player_id); }}
                              className={cn(
                                "w-full text-left rounded-lg p-2 transition-all border",
                                isSelected
                                  ? "border-primary bg-primary text-primary-foreground shadow-md"
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
                                  <span className={cn("text-[10px] leading-none mt-0.5 block", isSelected ? "text-primary-foreground/70" : "text-muted-foreground")}>
                                    {pts}p · {ast}a · {reb}r
                                  </span>
                                </div>
                                {/* Foul indicator — escalating visual weight */}
                                <div className="shrink-0 w-8 flex flex-col items-center justify-center">
                                  {fal >= 5 ? (
                                    <span className="text-[9px] font-bold bg-red-500 text-white rounded px-1 py-px leading-none">EXCL</span>
                                  ) : fal === 4 ? (
                                    <div className="flex flex-col items-center gap-px">
                                      <span className={cn("text-base font-black leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>{fal}</span>
                                      <span className={cn("text-[8px] font-bold leading-none", isSelected ? "text-orange-200" : "text-orange-500")}>F ⚠</span>
                                    </div>
                                  ) : fal === 3 ? (
                                    <span className={cn("text-sm font-bold leading-none", isSelected ? "text-amber-200" : "text-amber-500")}>{fal}F</span>
                                  ) : fal === 2 ? (
                                    <span className={cn("text-xs font-semibold leading-none", isSelected ? "text-primary-foreground/60" : "text-muted-foreground")}>{fal}F</span>
                                  ) : fal === 1 ? (
                                    <span className={cn("text-[10px] leading-none", isSelected ? "text-primary-foreground/40" : "text-muted-foreground/60")}>{fal}F</span>
                                  ) : null}
                                </div>
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
                        {/* Botón cambio rival — solo si se controla el tiempo */}
                        {match.track_rival_minutes && (
                          <Button
                            size="sm"
                            variant={showSubstitution === "rival" ? "default" : "outline"}
                            className="w-full h-8 gap-1.5 text-xs mt-1"
                            onClick={() => {
                              if (showSubstitution === "rival") {
                                setShowSubstitution(null);
                              } else {
                                setShowSubstitution("rival");
                                setSubStagedOut(new Set());
                                setSubStagedIn(new Set());
                              }
                            }}
                          >
                            <ArrowLeftRight className="h-3 w-3" />
                            Cambio
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>

                {/* Finalizar partido — solo en el último cuarto o prórroga */}
                {currentQuarter >= regularQuarters && (
                  <div className="flex items-center justify-center pt-2">
                    <Button size="sm" disabled={isTransitioning} onClick={() => finishMut.mutate()} className="gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Finalizar partido
                    </Button>
                  </div>
                )}
              </>
            )}

          </div>
        )}

        {/* Tab: Informe ─ read-only live/post-match stats */}
        {tab === "informe" && (
          <div className="space-y-8">
            {/* Stats type navigator — only shown when custom attrs exist */}
            {statAttributes.length > 0 && (
              <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${informeStatsTab === "predefined" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setInformeStatsTab("predefined")}
                >
                  Predefinidas
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${informeStatsTab === "custom" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  onClick={() => setInformeStatsTab("custom")}
                >
                  Personalizadas
                </button>
              </div>
            )}
            {/* ── Predefined stats section ── */}
            {(statAttributes.length === 0 || informeStatsTab === "predefined") && (
              <>
                {/* Home team — predefined */}
                <div>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {activeProfile?.team_name ?? "Nuestro equipo"}
                  </p>
                  {match.status === "in_progress" ? (
                    match.match_players.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                        No hay jugadores en la convocatoria.
                      </div>
                    ) : (
                      <LiveStatsTable
                        matchPlayers={match.match_players}
                        sessionStats={sessionStats}
                        playerEnteredAtMs={playerEnteredAtMs}
                        timerMs={timerMs}
                        trackMinutes={match.track_home_minutes}
                        onCourtIds={onCourtIds}
                        rosterJerseyMap={rosterJerseyMap}
                      />
                    )
                  ) : (
                    match.match_stats.length === 0 ? (
                      <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                        No se registraron estadísticas en este partido.
                      </div>
                    ) : (
                      <div>
                        <StatsTable matchPlayers={match.match_players} stats={match.match_stats} rosterJerseyMap={rosterJerseyMap} />
                        <StatsBarChart matchPlayers={match.match_players} stats={match.match_stats} />
                      </div>
                    )
                  )}
                </div>
                {/* Rival team — predefined */}
                {match.opponent_id && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {opponentTeam?.name ?? match.opponent_name} (rival)
                    </p>
                    {match.status === "in_progress" ? (
                      match.opponent_stats.length === 0 ? (
                        <div className="border rounded-lg p-6 text-center text-muted-foreground text-sm">
                          No hay jugadores rivales en la convocatoria.
                        </div>
                      ) : (
                        <LiveOppStatsTable
                          opponentStats={match.opponent_stats}
                          oppStatDraft={oppStatDraft}
                          rivalEnteredAtMs={rivalEnteredAtMs}
                          timerMs={timerMs}
                          trackMinutes={match.track_rival_minutes}
                          onCourtOppIds={onCourtOppIds}
                        />
                      )
                    ) : (
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

            {/* ── Custom stats section ── */}
            {statAttributes.length > 0 && informeStatsTab === "custom" && (
              <>
                {/* Home team — custom */}
                {match.match_players.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {activeProfile?.team_name ?? "Nuestro equipo"}
                    </p>
                    <CustomStatsReadTable
                      players={match.match_players.map(mp => ({
                        id: mp.player_id,
                        label: `${mp.player_first_name} ${mp.player_last_name}`,
                      }))}
                      statAttributes={statAttributes}
                      getValue={(playerId, attrId) =>
                        customMatchStats.find(s => s.player_id === playerId && s.stat_attribute_id === attrId)?.value ?? 0
                      }
                    />
                  </div>
                )}
                {/* Rival team — custom */}
                {match.opponent_id && match.opponent_stats.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      {opponentTeam?.name ?? match.opponent_name} (rival)
                    </p>
                    <CustomStatsReadTable
                      players={match.opponent_stats
                        .filter((os, idx, arr) => arr.findIndex(o => o.opponent_player_id === os.opponent_player_id) === idx)
                        .map(os => ({
                          id: os.opponent_player_id,
                          label: os.opponent_player?.name
                            ? os.opponent_player.name
                            : `#${os.opponent_player?.jersey_number ?? os.opponent_player_id}`,
                        }))}
                      statAttributes={statAttributes}
                      getValue={(playerId, attrId) =>
                        customMatchStats.find(s => s.opponent_player_id === playerId && s.stat_attribute_id === attrId)?.value ?? 0
                      }
                    />
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Tab: Jugada a jugada */}
        {tab === "jugada" && (
          <div className="space-y-4">
            {actionLog.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                Todavía no hay eventos registrados en este partido.
              </div>
            ) : (() => {
              // Group by quarter
              const regularQuarterCount = matchCompetition?.quarters ?? 4;
              const grouped = new Map<number, typeof actionLog>();
              [...actionLog].reverse().forEach((entry) => {
                const arr = grouped.get(entry.quarter) ?? [];
                arr.push(entry);
                grouped.set(entry.quarter, arr);
              });
              const quarters = Array.from(grouped.keys()).sort((a, b) => a - b);
              return (
                <div className="space-y-6">
                  {quarters.map((q) => {
                    const label = q > regularQuarterCount ? `OT${q - regularQuarterCount}` : `Q${q}`;
                    const entries = grouped.get(q)!;
                    return (
                      <div key={q} className="border rounded-lg overflow-hidden">
                        <div className="px-4 py-2 bg-muted/30 border-b">
                          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{label}</p>
                        </div>
                        <div className="divide-y">
                          {entries.map((entry) => (
                            <div key={entry.logId} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                              {/* Team indicator */}
                              {entry.team === "home" ? (
                                <div className="flex items-center gap-1 w-[90px] shrink-0">
                                  <span className="text-primary font-bold text-base leading-none">◀</span>
                                  <span className="text-[10px] font-semibold text-primary leading-tight truncate">
                                    {activeProfile?.team_name ?? "Local"}
                                  </span>
                                </div>
                              ) : entry.team === "rival" ? (
                                <div className="flex items-center justify-end gap-1 w-[90px] shrink-0">
                                  <span className="text-[10px] font-semibold text-orange-500 leading-tight truncate">
                                    {opponentTeam?.name ?? match.opponent_name}
                                  </span>
                                  <span className="text-orange-500 font-bold text-base leading-none">▶</span>
                                </div>
                              ) : (
                                <div className="w-[90px] shrink-0" />
                              )}
                              {/* Player name */}
                              <span className="flex-1 font-medium truncate">{entry.playerName}</span>
                              {/* Action badge */}
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-xs font-semibold shrink-0",
                                entry.delta > 0
                                  ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : "bg-muted text-muted-foreground",
                              )}>
                                {entry.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <p className="text-xs text-muted-foreground text-center pb-2">
                    Los eventos se almacenan en memoria — se pierden al recargar la página.
                  </p>
                </div>
              );
            })()}
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

      {/* Out-of-time confirmation dialog */}
      <AlertDialog open={outOfTimeDialog.open} onOpenChange={(open) => { if (!open) setOutOfTimeDialog((d) => ({ ...d, open: false })); }}>
        <AlertDialogContent className="max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Añadir acción fuera de tiempo?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{outOfTimeDialog.label}</strong> se registrará fuera de tiempo para el{" "}
              <strong>{quarterLabel}</strong>. El reloj ha llegado a 0.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                outOfTimeDialog.onConfirm();
                setOutOfTimeDialog((d) => ({ ...d, open: false }));
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Next-quarter gate dialog */}
      <Dialog open={nextQuarterOpen} onOpenChange={setNextQuarterOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {nextQuarterType === "error" ? "No es posible avanzar" : "¿Avanzar de periodo?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">{nextQuarterMsg}</p>
          <DialogFooter>
            {nextQuarterType === "error" ? (
              <Button onClick={() => setNextQuarterOpen(false)}>Entendido</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setNextQuarterOpen(false)}>Cancelar</Button>
                <Button onClick={() => { setNextQuarterOpen(false); doNextQuarter(); }}>Avanzar</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit time dialog — drum picker */}
      {(() => {
        const maxMin = Math.floor(periodDurationMs / 60000);
        const startHold = (fn: () => void) => {
          fn();
          holdRef.current = setInterval(fn, 110);
        };
        const stopHold = () => {
          if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; }
        };
        const incMin = () => setEditTimeMin((m) => Math.min(maxMin, m + 1));
        const decMin = () => setEditTimeMin((m) => Math.max(0, m - 1));
        const incSec = () => setEditTimeSec((s) => (s >= 59 ? 0 : s + 1));
        const decSec = () => setEditTimeSec((s) => (s <= 0 ? 59 : s - 1));

        // Quick presets: fixed times ≤ period duration
        const allPresets = [
          { label: `${maxMin}:00`, min: maxMin, sec: 0 },
          { label: "5:00", min: 5, sec: 0 },
          { label: "2:00", min: 2, sec: 0 },
          { label: "1:00", min: 1, sec: 0 },
          { label: "0:30", min: 0, sec: 30 },
          { label: "0:00", min: 0, sec: 0 },
        ].filter(({ min, sec }) => min * 60 + sec <= maxMin * 60);
        const presets = allPresets.filter(
          (p, i, arr) => i === 0 || p.min !== arr[i - 1].min || p.sec !== arr[i - 1].sec,
        );

        const drumBtn = "rounded-lg h-10 w-10 flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors select-none cursor-pointer active:scale-95";

        return (
          <Dialog open={editTimeOpen} onOpenChange={(open) => { stopHold(); setEditTimeOpen(open); }}>
            <DialogContent className="max-w-[280px]">
              <DialogHeader>
                <DialogTitle className="text-base">Tiempo restante — {quarterLabel}</DialogTitle>
              </DialogHeader>

              {/* Drum picker */}
              <div className="flex items-center justify-center gap-3 py-2">
                {/* Minutes */}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    className={drumBtn}
                    onPointerDown={() => startHold(incMin)} onPointerUp={stopHold} onPointerLeave={stopHold}
                  >
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <div
                    className="w-[72px] h-[64px] rounded-xl bg-muted flex items-center justify-center cursor-ns-resize"
                    onWheel={(e) => { e.preventDefault(); e.deltaY < 0 ? incMin() : decMin(); }}
                  >
                    <span className="text-4xl font-mono font-bold tabular-nums leading-none select-none">
                      {String(editTimeMin).padStart(2, "0")}
                    </span>
                  </div>
                  <button
                    className={drumBtn}
                    onPointerDown={() => startHold(decMin)} onPointerUp={stopHold} onPointerLeave={stopHold}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">min</span>
                </div>

                {/* Separator */}
                <span className="text-3xl font-bold text-muted-foreground pb-6 select-none">:</span>

                {/* Seconds */}
                <div className="flex flex-col items-center gap-0.5">
                  <button
                    className={drumBtn}
                    onPointerDown={() => startHold(incSec)} onPointerUp={stopHold} onPointerLeave={stopHold}
                  >
                    <ChevronUp className="h-5 w-5" />
                  </button>
                  <div
                    className="w-[72px] h-[64px] rounded-xl bg-muted flex items-center justify-center cursor-ns-resize"
                    onWheel={(e) => { e.preventDefault(); e.deltaY < 0 ? incSec() : decSec(); }}
                  >
                    <span className="text-4xl font-mono font-bold tabular-nums leading-none select-none">
                      {String(editTimeSec).padStart(2, "0")}
                    </span>
                  </div>
                  <button
                    className={drumBtn}
                    onPointerDown={() => startHold(decSec)} onPointerUp={stopHold} onPointerLeave={stopHold}
                  >
                    <ChevronDown className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">seg</span>
                </div>
              </div>

              {/* Quick presets */}
              <div className="flex flex-wrap gap-1.5 justify-center pb-1">
                {presets.map(({ label, min, sec }) => (
                  <button
                    key={label}
                    onClick={() => { setEditTimeMin(min); setEditTimeSec(sec); }}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-xs border font-medium transition-colors",
                      editTimeMin === min && editTimeSec === sec
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => { stopHold(); setEditTimeOpen(false); }}>Cancelar</Button>
                <Button
                  size="sm"
                  onClick={() => {
                    stopHold();
                    const targetRemainingMs = Math.min((editTimeMin * 60 + editTimeSec) * 1000, periodDurationMs);
                    const newTimerMs = Math.max(0, periodDurationMs - targetRemainingMs);
                    flushHomeMins(newTimerMs, newTimerMs);
                    flushRivalMins(newTimerMs, newTimerMs);
                    timerBaseRef.current = newTimerMs;
                    setTimerMs(newTimerMs);
                    setEditTimeOpen(false);
                  }}
                >
                  Aplicar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

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


// ── fmtMinSec — format total milliseconds as "mm:ss" ────────────────────────
function fmtMinSec(totalMs: number): string {
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ── LiveStatsTable — live stats during in_progress using sessionStats ────────

function LiveStatsTable({
  matchPlayers,
  sessionStats,
  playerEnteredAtMs,
  timerMs,
  trackMinutes,
  onCourtIds,
  rosterJerseyMap,
}: {
  matchPlayers: MatchPlayer[];
  sessionStats: Map<number, Partial<import("@basketball-clipper/shared/types").MatchStatUpsert>>;
  playerEnteredAtMs: Record<number, number>;
  timerMs: number;
  trackMinutes: boolean;
  onCourtIds: Set<number>;
  rosterJerseyMap: Map<number, number | null>;
}) {
  const sorted = [...matchPlayers].sort(
    (a, b) => (rosterJerseyMap.get(a.player_id) ?? 999) - (rosterJerseyMap.get(b.player_id) ?? 999),
  );

  const rows = sorted.map((mp) => {
    const stat = sessionStats.get(mp.player_id);
    const savedMs = ((stat?.minutes ?? 0) as number) * 60000;
    const stintMs = trackMinutes && onCourtIds.has(mp.player_id) && playerEnteredAtMs[mp.player_id] != null
      ? Math.max(0, timerMs - playerEnteredAtMs[mp.player_id])
      : 0;
    const liveMs = savedMs + stintMs;
    const reb = ((stat?.defensive_rebounds ?? 0) as number) + ((stat?.offensive_rebounds ?? 0) as number);
    const jersey = rosterJerseyMap.get(mp.player_id);
    return {
      mp,
      hasStat: !!stat,
      liveMs,
      pts: (stat?.points as number | undefined) ?? 0,
      reb,
      ast: (stat?.assists as number | undefined) ?? 0,
      stl: (stat?.steals as number | undefined) ?? 0,
      blk: (stat?.blocks as number | undefined) ?? 0,
      tov: (stat?.turnovers as number | undefined) ?? 0,
      fls: (stat?.fouls as number | undefined) ?? 0,
      jersey,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      ms:  acc.ms  + r.liveMs,
      pts: acc.pts + r.pts,
      reb: acc.reb + r.reb,
      ast: acc.ast + r.ast,
      stl: acc.stl + r.stl,
      blk: acc.blk + r.blk,
      tov: acc.tov + r.tov,
      fls: acc.fls + r.fls,
    }),
    { ms: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fls: 0 },
  );

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium">Jugador</th>
            {trackMinutes && <th className="text-center px-2 py-2 font-medium w-16">Min</th>}
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
          {rows.map(({ mp, hasStat, liveMs, pts, reb, ast, stl, blk, tov, fls, jersey }) => (
            <tr key={mp.player_id} className={cn("border-b last:border-0", onCourtIds.has(mp.player_id) && "bg-primary/5")}>
              <td className="px-4 py-2.5 font-medium">
                <div className="flex items-center gap-1.5">
                  {onCourtIds.has(mp.player_id) && (
                    <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  )}
                  {jersey != null && <span className="text-xs text-muted-foreground font-mono">#{jersey}</span>}
                  <span>{mp.player_first_name} {mp.player_last_name}</span>
                </div>
              </td>
              {trackMinutes && (
                <td className="text-center px-2 py-2.5 text-muted-foreground font-mono text-xs">
                  {liveMs > 0 ? fmtMinSec(liveMs) : "—"}
                </td>
              )}
              <td className="text-center px-2 py-2.5 font-semibold">{hasStat ? pts : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? reb : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? ast : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? stl : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? blk : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? tov : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasStat ? fls : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-semibold text-foreground">
            <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">Total</td>
            {trackMinutes && (
              <td className="text-center px-2 py-2 font-mono text-xs">
                {totals.ms > 0 ? fmtMinSec(totals.ms) : "—"}
              </td>
            )}
            <td className="text-center px-2 py-2">{totals.pts}</td>
            <td className="text-center px-2 py-2">{totals.reb}</td>
            <td className="text-center px-2 py-2">{totals.ast}</td>
            <td className="text-center px-2 py-2">{totals.stl}</td>
            <td className="text-center px-2 py-2">{totals.blk}</td>
            <td className="text-center px-2 py-2">{totals.tov}</td>
            <td className="text-center px-2 py-2">{totals.fls}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── LiveOppStatsTable — live rival stats during in_progress ──────────────────

function LiveOppStatsTable({
  opponentStats,
  oppStatDraft,
  rivalEnteredAtMs,
  timerMs,
  trackMinutes,
  onCourtOppIds,
}: {
  opponentStats: OpponentMatchStat[];
  oppStatDraft: Map<number, Partial<import("@basketball-clipper/shared/types").OpponentMatchStatUpsert>>;
  rivalEnteredAtMs: Record<number, number>;
  timerMs: number;
  trackMinutes: boolean;
  onCourtOppIds: Set<number>;
}) {
  const sorted = [...opponentStats].sort(
    (a, b) => (a.opponent_player.jersey_number ?? 999) - (b.opponent_player.jersey_number ?? 999),
  );

  const rows = sorted.map((os) => {
    const draft = oppStatDraft.get(os.opponent_player_id) ?? {};
    const savedMs = ((draft.minutes ?? 0) as number) * 60000;
    const stintMs = trackMinutes && onCourtOppIds.has(os.opponent_player_id) && rivalEnteredAtMs[os.opponent_player_id] != null
      ? Math.max(0, timerMs - rivalEnteredAtMs[os.opponent_player_id])
      : 0;
    const liveMs = savedMs + stintMs;
    const hasDraft = Object.keys(draft).length > 0;
    const reb = ((draft.defensive_rebounds ?? 0) as number) + ((draft.offensive_rebounds ?? 0) as number);
    return {
      os,
      hasDraft,
      liveMs,
      pts: (draft.points as number | undefined) ?? 0,
      reb,
      ast: (draft.assists as number | undefined) ?? 0,
      stl: (draft.steals as number | undefined) ?? 0,
      blk: (draft.blocks as number | undefined) ?? 0,
      tov: (draft.turnovers as number | undefined) ?? 0,
      fls: (draft.fouls as number | undefined) ?? 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      ms:  acc.ms  + r.liveMs,
      pts: acc.pts + r.pts,
      reb: acc.reb + r.reb,
      ast: acc.ast + r.ast,
      stl: acc.stl + r.stl,
      blk: acc.blk + r.blk,
      tov: acc.tov + r.tov,
      fls: acc.fls + r.fls,
    }),
    { ms: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fls: 0 },
  );

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium">Jugador</th>
            {trackMinutes && <th className="text-center px-2 py-2 font-medium w-16">Min</th>}
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
          {rows.map(({ os, hasDraft, liveMs, pts, reb, ast, stl, blk, tov, fls }) => (
            <tr key={os.opponent_player_id} className={cn("border-b last:border-0", onCourtOppIds.has(os.opponent_player_id) && "bg-primary/5")}>
              <td className="px-4 py-2.5 font-medium">
                {onCourtOppIds.has(os.opponent_player_id) && (
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary mr-1.5 shrink-0" />
                )}
                {os.opponent_player.name ?? `#${os.opponent_player.jersey_number}`}
              </td>
              {trackMinutes && (
                <td className="text-center px-2 py-2.5 text-muted-foreground font-mono text-xs">
                  {liveMs > 0 ? fmtMinSec(liveMs) : "—"}
                </td>
              )}
              <td className="text-center px-2 py-2.5 font-semibold">{hasDraft ? pts : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? reb : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? ast : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? stl : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? blk : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? tov : "—"}</td>
              <td className="text-center px-2 py-2.5 text-muted-foreground">{hasDraft ? fls : "—"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t bg-muted/40 font-semibold text-foreground">
            <td className="px-4 py-2 text-xs uppercase tracking-wide text-muted-foreground">Total</td>
            {trackMinutes && (
              <td className="text-center px-2 py-2 font-mono text-xs">
                {totals.ms > 0 ? fmtMinSec(totals.ms) : "—"}
              </td>
            )}
            <td className="text-center px-2 py-2">{totals.pts}</td>
            <td className="text-center px-2 py-2">{totals.reb}</td>
            <td className="text-center px-2 py-2">{totals.ast}</td>
            <td className="text-center px-2 py-2">{totals.stl}</td>
            <td className="text-center px-2 py-2">{totals.blk}</td>
            <td className="text-center px-2 py-2">{totals.tov}</td>
            <td className="text-center px-2 py-2">{totals.fls}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── StatsTable — read-only stats view ────────────────────────────────────────────

import type { MatchPlayer, MatchStat, OpponentMatchStat } from "@basketball-clipper/shared/types";

function StatsTable({
  matchPlayers,
  stats,
  rosterJerseyMap,
}: {
  matchPlayers: MatchPlayer[];
  stats: MatchStat[];
  rosterJerseyMap?: Map<number, number | null>;
}) {
  // When match_players is empty, fall back to stats rows directly.
  const rows = (
    matchPlayers.length > 0
      ? matchPlayers.map((mp) => {
          const stat = stats.find((s) => s.player_id === mp.player_id);
          const jersey = rosterJerseyMap?.get(mp.player_id);
          return { key: mp.player_id, firstName: mp.player_first_name, lastName: mp.player_last_name, stat, jersey };
        })
      : stats.map((s) => ({
          key: s.player_id,

          firstName: s.player_first_name,
          lastName: s.player_last_name,
          stat: s,
          jersey: undefined as number | null | undefined,
        }))
  );

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
          {rows.map(({ key, firstName, lastName, stat, jersey }) => {
            const totalReb = (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0);
            return (
              <tr key={key} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium">
                  {jersey != null && (
                    <span className="text-muted-foreground mr-1.5 text-xs">#{jersey}</span>
                  )}
                  {firstName} {lastName}
                </td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.minutes ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 font-semibold">{stat?.points ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat ? totalReb : "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.assists ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.steals ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.blocks ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.turnovers ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{stat?.fouls ?? "\u2014"}</td>
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
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.minutes ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 font-semibold">{os.points ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{totalReb || "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.assists ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.steals ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.blocks ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.turnovers ?? "\u2014"}</td>
                <td className="text-center px-2 py-2.5 text-muted-foreground">{os.fouls ?? "\u2014"}</td>
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

  const rows = (
    matchPlayers.length > 0
      ? matchPlayers.map((mp) => {
          const stat = stats.find((s) => s.player_id === mp.player_id);
          return { name: `${mp.player_first_name} ${mp.player_last_name}`, stat };
        })
      : stats.map((s) => ({ name: `${s.player_first_name} ${s.player_last_name}`, stat: s }))
  )
    .map(({ name, stat }) => ({
      name,
      points:   stat?.points   ?? 0,
      rebounds: (stat?.defensive_rebounds ?? 0) + (stat?.offensive_rebounds ?? 0),
      assists:  stat?.assists  ?? 0,
    }))
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
}// ── CustomStatsReadTable — tabla de solo lectura de stats personalizadas ────────

function CustomStatsReadTable({
  players,
  statAttributes,
  getValue,
}: {
  players: { id: number; label: string }[];
  statAttributes: TeamStatAttribute[];
  getValue: (playerId: number, attrId: number) => number;
}) {
  if (players.length === 0 || statAttributes.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30">
            <th className="text-left px-4 py-2 font-medium">Jugador</th>
            {statAttributes.map((attr) => (
              <th key={attr.id} className="text-center px-3 py-2 font-medium whitespace-nowrap">
                {attr.short_name ?? attr.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((player) => {
            const values = statAttributes.map((a) => getValue(player.id, a.id));
            return (
              <tr key={player.id} className="border-b last:border-0">
                <td className="px-4 py-2.5 font-medium whitespace-nowrap">{player.label}</td>
                {values.map((val, i) => (
                  <td key={statAttributes[i].id} className="text-center px-3 py-2">
                    <span className={val === 0 ? "text-muted-foreground/40" : "font-semibold"}>
                      {val > 0 ? val : "\u2014"}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
