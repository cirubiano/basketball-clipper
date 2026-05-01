"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Swords, Plus, Archive, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  listMatches,
  createMatch,
  archiveMatch,
  getSeasons,
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
  Season,
} from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
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
import { Breadcrumb } from "@/components/layout/Breadcrumb";

const LOCATIONS: MatchLocation[] = ["home", "away", "neutral"];

function statusBadgeClass(status: MatchStatus): string {
  switch (status) {
    case "scheduled":   return "bg-secondary text-secondary-foreground";
    case "in_progress": return "bg-green-500 text-white animate-pulse";
    case "finished":    return "bg-blue-600 text-white";
    case "cancelled":   return "bg-destructive text-destructive-foreground line-through";
  }
}

export default function MatchesPage({
  params,
}: {
  params: { teamId: string };
}) {
  const teamId = Number(params.teamId);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clubId = activeProfile?.club_id;
  const isCoachOrTD =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterSeasonId, setFilterSeasonId] = useState<string>("all");
  const [form, setForm] = useState<MatchCreate>({
    opponent_name: "",
    date: "",
    location: "home",
    season_id: 0,
    status: "scheduled",
  });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: matches = [], isLoading: matchesLoading } = useQuery({
    queryKey: ["matches", teamId, filterSeasonId],
    queryFn: () =>
      listMatches(
        token!,
        clubId!,
        teamId,
        filterSeasonId !== "all" ? Number(filterSeasonId) : undefined,
      ),
    enabled: !!token && !!clubId,
  });

  const isLoading = seasonsLoading || matchesLoading;

  const createMut = useMutation({
    mutationFn: (data: MatchCreate) => createMatch(token!, clubId!, teamId, data),
    onSuccess: (m) => {
      void qc.invalidateQueries({ queryKey: ["matches", teamId] });
      toast(`Partido vs. ${m.opponent_name} creado.`);
      setDialogOpen(false);
      setForm({ opponent_name: "", date: "", location: "home", season_id: 0, status: "scheduled" });
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

  function openCreate() {
    const activeSeason = seasons.find((s) => s.status === "active") ?? seasons[0];
    setForm({
      opponent_name: "",
      date: "",
      location: "home",
      season_id: activeSeason?.id ?? 0,
      status: "scheduled",
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.opponent_name.trim()) { setFormError("El nombre del rival es obligatorio"); return; }
    if (!form.date) { setFormError("La fecha es obligatoria"); return; }
    if (!form.season_id) { setFormError("Selecciona una temporada"); return; }
    createMut.mutate(form);
  }

  function seasonName(id: number) {
    return seasons.find((s) => s.id === id)?.name ?? `Temporada ${id}`;
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Breadcrumb items={[
          { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
          { label: activeProfile?.team_name ?? "Equipo" },
          { label: "Partidos" },
        ]} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Partidos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {matches.length} partido{matches.length !== 1 ? "s" : ""}
              {filterSeasonId !== "all" && <> · {seasonName(Number(filterSeasonId))}</>}
            </p>
          </div>
          {isCoachOrTD && (
            <Button onClick={openCreate} disabled={seasons.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo partido
            </Button>
          )}
        </div>

        {seasons.length > 1 && (
          <div className="mb-4 flex items-center gap-2">
            <Label className="text-sm shrink-0">Temporada</Label>
            <Select value={filterSeasonId} onValueChange={setFilterSeasonId}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
          </div>
        ) : matches.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <Swords className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No hay partidos todavía.</p>
            {isCoachOrTD && seasons.length > 0 && (
              <Button variant="link" onClick={openCreate}>Crea el primero</Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {[...matches].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                seasonName={seasonName(m.season_id)}
                isCoachOrTD={isCoachOrTD}
                isArchiving={archiveMut.isPending && archiveMut.variables === m.id}
                onArchive={() => archiveMut.mutate(m.id)}
                clubId={clubId!}
                teamId={teamId}
              />
            ))}
          </div>
        )}
      </div>

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
            <div className="space-y-1.5">
              <Label htmlFor="opponent">Rival *</Label>
              <Input
                id="opponent"
                placeholder="Club Baloncesto Ejemplo"
                value={form.opponent_name}
                onChange={(e) => setForm((f) => ({ ...f, opponent_name: e.target.value }))}
              />
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    {seasons.map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
              disabled={createMut.isPending || !form.opponent_name.trim() || !form.date || !form.season_id}
            >
              {createMut.isPending ? "Creando..." : "Crear partido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function MatchRow({
  match,
  seasonName,
  isCoachOrTD,
  isArchiving,
  onArchive,
  clubId,
  teamId,
}: {
  match: Match;
  seasonName: string;
  isCoachOrTD: boolean;
  isArchiving: boolean;
  onArchive: () => void;
  clubId: number;
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
        <Link
          href={`/teams/${teamId}/matches/${match.id}`}
          className="block hover:underline"
        >
          <p className="font-medium text-sm">
            vs. {match.opponent_name}
            <Badge
              className={`ml-2 text-xs ${statusBadgeClass(match.status)}`}
            >
              {MATCH_STATUS_LABELS[match.status]}
            </Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {dateStr} {timeStr} · {MATCH_LOCATION_LABELS[match.location]} · {seasonName}
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
