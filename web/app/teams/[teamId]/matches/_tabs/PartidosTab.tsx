"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Plus, Archive, ChevronRight, Search } from "lucide-react";
import Link from "next/link";
import {
  listMatches,
  createMatch,
  archiveMatch,
  deleteMatchPermanently,
  getSeasons,
  listCompetitions,
  listOpponents,
} from "@basketball-clipper/shared/api";
import {
  MATCH_LOCATION_LABELS,
  MATCH_STATUS_LABELS,
} from "@basketball-clipper/shared/types";
import type {
  Match,
  MatchCreate,
  MatchLocation,
  MatchStatus,
  Competition,
  OpponentTeamSummary,
} from "@basketball-clipper/shared/types";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PaginationBar } from "@/components/ui/pagination-bar";

const LOCATIONS: MatchLocation[] = ["home", "away", "neutral"];

function statusBadgeClass(status: MatchStatus): string {
  switch (status) {
    case "scheduled":   return "bg-secondary text-secondary-foreground";
    case "in_progress": return "bg-green-500 text-white animate-pulse";
    case "finished":    return "bg-blue-600 text-white";
    case "cancelled":   return "bg-destructive text-destructive-foreground line-through";
  }
}

interface Props {
  teamId: number;
  initialCompetitionId?: number;
}

// Local form type — competition_id is optional until submit validates it
type MatchFormState = Omit<MatchCreate, "competition_id"> & { competition_id: number | undefined };

export default function PartidosTab({ teamId, initialCompetitionId }: Props) {
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clubId = activeProfile?.club_id;
  const isCoachOrTD =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [filterCompId, setFilterCompId] = useState<number | undefined>(initialCompetitionId);
  const [search, setSearch] = useState("");

  // Rival mode: "registered" picks from the opponents list, "custom" free-text
  const [rivalMode, setRivalMode] = useState<"registered" | "custom">("registered");

  const [form, setForm] = useState<MatchFormState>({
    opponent_name: "",
    date: "",
    location: "home",
    season_id: 0,
    status: "scheduled",
    competition_id: undefined,
    opponent_id: undefined,
  });
  const [formError, setFormError] = useState<string | null>(null);

  // Sync competition filter when hub navigates here with a specific competition
  useEffect(() => {
    setFilterCompId(initialCompetitionId);
    setPage(1);
  }, [initialCompetitionId]);

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: competitions = [] } = useQuery<Competition[]>({
    queryKey: ["competitions", teamId, null],
    queryFn: () => listCompetitions(token!, clubId!, teamId),
    enabled: !!token && !!clubId && !!teamId,
  });

  const { data: opponents = [] } = useQuery<OpponentTeamSummary[]>({
    queryKey: ["opponents", clubId],
    queryFn: () => listOpponents(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches", teamId],
    queryFn: () => listMatches(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  const isLoading = seasonsLoading || matchesLoading;

  const createMut = useMutation({
    mutationFn: (data: MatchCreate) => createMatch(token!, clubId!, teamId, data),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} creado.`);
      setDialogOpen(false);
      setForm({ opponent_name: "", date: "", location: "home", season_id: 0, status: "scheduled", competition_id: undefined, opponent_id: undefined });
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (matchId: number) => archiveMatch(token!, clubId!, teamId, matchId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast("Partido archivado.");
    },
  });

  const deletePermanentMut = useMutation({
    mutationFn: (matchId: number) => deleteMatchPermanently(token!, clubId!, teamId, matchId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast("Partido eliminado permanentemente.");
    },
    onError: () => toast("Error al eliminar el partido."),
  });

  function openCreate() {
    const activeSeason = seasons.find((s) => s.status === "active") ?? seasons[0];
    // Pre-select the filtered competition if there is one
    const activeComp = filterCompId
      ? competitions.find((c) => c.id === filterCompId)
      : competitions.find((c) => c.is_default);
    setRivalMode("registered");
    setForm({
      opponent_name: "",
      date: "",
      location: "home",
      season_id: activeSeason?.id ?? 0,
      status: "scheduled",
      competition_id: activeComp?.id ?? undefined,
      opponent_id: undefined,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSelectRival(value: string) {
    if (value === "custom") {
      setRivalMode("custom");
      setForm((f) => ({ ...f, opponent_id: undefined, opponent_name: "" }));
    } else {
      const opp = opponents.find((o) => String(o.id) === value);
      setRivalMode("registered");
      setForm((f) => ({
        ...f,
        opponent_id: opp ? opp.id : undefined,
        opponent_name: opp ? opp.name : "",
      }));
    }
  }

  function handleSubmit() {
    if (!form.opponent_name.trim()) { setFormError("El nombre del rival es obligatorio"); return; }
    if (!form.date) { setFormError("La fecha es obligatoria"); return; }
    if (!form.season_id) { setFormError("Selecciona una temporada"); return; }
    if (!form.competition_id) { setFormError("Selecciona una competición"); return; }
    createMut.mutate(form as MatchCreate);
  }

  function seasonName(id: number) {
    return seasons.find((s) => s.id === id)?.name ?? `Temporada ${id}`;
  }

  function competitionName(id: number | null) {
    if (!id) return null;
    return competitions.find((c) => c.id === id)?.name ?? null;
  }

  const searchQ = search.trim().toLowerCase();
  const PAGE_SIZE_M = 20;

  const activeCompetitions = competitions.filter((c) => !c.archived_at);

  const allSorted = [...matches]
    .filter((m) => !m.archived_at)
    .filter((m) => !searchQ || m.opponent_name.toLowerCase().includes(searchQ))
    .filter((m) => filterCompId === undefined || m.competition_id === filterCompId)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalPagesM = Math.max(1, Math.ceil(allSorted.length / PAGE_SIZE_M));
  const safePageM = Math.min(page, totalPagesM);
  const sortedMatches = allSorted.slice((safePageM - 1) * PAGE_SIZE_M, safePageM * PAGE_SIZE_M);

  const activeOpponents = opponents.filter((o) => !o.archived_at);
  const filterCompName = filterCompId ? competitionName(filterCompId) : null;

  // Matches with no competition assigned — legacy cleanup
  const matchesWithoutComp = matches.filter((m) => !m.archived_at && !m.competition_id);

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">
          {allSorted.length} partido{allSorted.length !== 1 ? "s" : ""}
          {filterCompName && <> &middot; <strong className="font-medium text-foreground">{filterCompName}</strong></>}
        </p>
        {isCoachOrTD && (
          <Button onClick={openCreate} size="sm" disabled={seasons.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo partido
          </Button>
        )}
      </div>

      <div className="mb-4 flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar por rival…"
            className="pl-9 h-9 text-sm"
          />
        </div>
        {activeCompetitions.length > 1 && (
          <Select
            value={filterCompId ? String(filterCompId) : "all"}
            onValueChange={(v) => { setFilterCompId(v === "all" ? undefined : Number(v)); setPage(1); }}
          >
            <SelectTrigger className="w-full sm:w-52 h-9">
              <SelectValue placeholder="Todas las competiciones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las competiciones</SelectItem>
              {activeCompetitions.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}{c.is_default ? " ★" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isCoachOrTD && matchesWithoutComp.length > 0 && (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-medium text-destructive">
            {matchesWithoutComp.length} partido{matchesWithoutComp.length !== 1 ? "s" : ""} sin competición asignada
          </p>
          <p className="text-xs text-muted-foreground">
            Los partidos deben pertenecer a una competición. Elimina permanentemente los que no puedas asignar.
          </p>
          <div className="space-y-2">
            {matchesWithoutComp.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  vs. {m.opponent_name} &middot;{" "}
                  <span className="text-muted-foreground text-xs">
                    {new Date(m.date).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                  </span>
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 text-xs">
                      Eliminar
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Eliminar partido permanentemente?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará el partido <strong>vs. {m.opponent_name}</strong> y todos sus datos asociados. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => deletePermanentMut.mutate(m.id)}
                      >
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : sortedMatches.length === 0 && allSorted.length === 0 ? (
        <div className="border rounded-lg border-dashed p-14 text-center">
          <Swords className="h-9 w-9 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium mb-1">
            {filterCompId ? "Sin partidos en esta competición" : "Sin partidos todavía"}
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            {isCoachOrTD
              ? "Registra los partidos del equipo para hacer seguimiento de resultados y estadísticas."
              : "El cuerpo técnico aún no ha registrado ningún partido."}
          </p>
          {isCoachOrTD && seasons.length > 0 && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Crear partido
            </Button>
          )}
          {isCoachOrTD && seasons.length === 0 && (
            <p className="text-xs text-destructive">Crea una temporada antes de añadir partidos.</p>
          )}
        </div>
      ) : (
        <>
          <div className="border rounded-lg divide-y">
            {sortedMatches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                seasonName={seasonName(m.season_id)}
                competitionName={competitionName(m.competition_id)}
                isCoachOrTD={isCoachOrTD}
                isArchiving={archiveMut.isPending && archiveMut.variables === m.id}
                onArchive={() => archiveMut.mutate(m.id)}
                teamId={teamId}
              />
            ))}
          </div>
          <PaginationBar page={safePageM} totalPages={totalPagesM} onPage={setPage} className="pb-2" />
        </>
      )}

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo partido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">

            {/* Unified rival field */}
            <div className="space-y-1.5">
              <Label>Rival *</Label>
              <Select
                value={rivalMode === "registered" && form.opponent_id
                  ? String(form.opponent_id)
                  : "custom"}
                onValueChange={handleSelectRival}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona o escribe un rival..." />
                </SelectTrigger>
                <SelectContent>
                  {activeOpponents.map((o) => (
                    <SelectItem key={o.id} value={String(o.id)}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border border-black/10"
                          style={{ backgroundColor: o.color ?? "#6366f1" }}
                        />
                        {o.name}
                      </span>
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">
                    ✏️ + Nuevo rival
                  </SelectItem>
                </SelectContent>
              </Select>
              {(rivalMode === "custom" || !form.opponent_id) && (
                <Input
                  placeholder="Nombre del equipo rival"
                  value={form.opponent_name}
                  onChange={(e) => setForm((f) => ({ ...f, opponent_name: e.target.value }))}
                />
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="match-date">Fecha y hora *</Label>
              <Input
                id="match-date"
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Localización *</Label>
                <Select
                  value={form.location}
                  onValueChange={(v) => setForm((f) => ({ ...f, location: v as MatchLocation }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LOCATIONS.map((l) => (
                      <SelectItem key={l} value={l}>{MATCH_LOCATION_LABELS[l]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Temporada *</Label>
                <Select
                  value={form.season_id ? String(form.season_id) : ""}
                  onValueChange={(v) => setForm((f) => ({ ...f, season_id: Number(v) }))}
                >
                  <SelectTrigger><SelectValue placeholder="Selecciona" /></SelectTrigger>
                  <SelectContent>
                    {seasons.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Competición <span className="text-destructive">*</span></Label>
              <Select
                value={form.competition_id ? String(form.competition_id) : "none"}
                onValueChange={(v) => setForm((f) => ({ ...f, competition_id: v === "none" ? undefined : Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="Selecciona una competición" /></SelectTrigger>
                <SelectContent>
                  {competitions
                    .filter((c) => !c.archived_at && (!form.season_id || c.season_id === form.season_id))
                    .length === 0 && (
                    <SelectItem value="none" disabled>Sin competiciones disponibles</SelectItem>
                  )}
                  {competitions
                    .filter((c) => !c.archived_at && (!form.season_id || c.season_id === form.season_id))
                    .map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}{c.is_default ? " ★" : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMut.isPending || !form.opponent_name.trim() || !form.date || !form.season_id || !form.competition_id}
            >
              {createMut.isPending ? "Creando..." : "Crear partido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function MatchRow({
  match,
  seasonName,
  competitionName,
  isCoachOrTD,
  isArchiving,
  onArchive,
  teamId,
}: {
  match: Match;
  seasonName: string;
  competitionName: string | null;
  isCoachOrTD: boolean;
  isArchiving: boolean;
  onArchive: () => void;
  teamId: number;
}) {
  const dateStr = new Date(match.date).toLocaleDateString("es-ES", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = new Date(match.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <Link href={`/teams/${teamId}/matches/${match.id}`} className="block hover:underline">
          <div className="flex items-center gap-2 font-medium text-sm">
            vs. {match.opponent_name}
            <Badge className={`text-xs ${statusBadgeClass(match.status)}`}>
              {MATCH_STATUS_LABELS[match.status]}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {dateStr} {timeStr} &middot; {MATCH_LOCATION_LABELS[match.location]}
            {competitionName && <> &middot; {competitionName}</>}
            {" · "}{seasonName}
          </p>
        </Link>
      </div>
      <Link
        href={`/teams/${teamId}/matches/${match.id}`}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={`Ver partido vs. ${match.opponent_name}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>
      {isCoachOrTD && !match.archived_at && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              disabled={isArchiving}
              aria-label={`Archivar partido vs. ${match.opponent_name}`}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Archivar partido?</AlertDialogTitle>
              <AlertDialogDescription>
                El partido vs. <strong>{match.opponent_name}</strong> quedará archivado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onArchive}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Archivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  );
}
