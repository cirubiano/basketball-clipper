"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Archive } from "lucide-react";
import {
  getTeams,
  getSeasons,
  createTeam,
  archiveTeam,
} from "@basketball-clipper/shared/api";
import type { Team, TeamCreate, Season } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
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

// ── component ─────────────────────────────────────────────────────────────────

export default function TeamsPage({
  params,
}: {
  params: { clubId: string };
}) {
  const { clubId: clubIdStr } = params;
  const clubId = Number(clubIdStr);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const isTD = activeProfile?.role === "technical_director";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterSeasonId, setFilterSeasonId] = useState<string>("all");
  const [form, setForm] = useState<TeamCreate>({ name: "", season_id: 0 });
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId),
    enabled: !!token,
  });

  const activeSeasons = seasons.filter((s) => s.status !== "archived");

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["teams", clubId, filterSeasonId],
    queryFn: () =>
      getTeams(
        token!,
        clubId,
        filterSeasonId !== "all" ? Number(filterSeasonId) : undefined
      ),
    enabled: !!token,
  });

  const isLoading = seasonsLoading || teamsLoading;

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: TeamCreate) => createTeam(token!, clubId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams", clubId] });
      setDialogOpen(false);
      setForm({ name: "", season_id: 0 });
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (teamId: number) => archiveTeam(token!, clubId, teamId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams", clubId] }),
  });

  function openCreate() {
    const defaultSeason = activeSeasons.find((s) => s.status === "active") ?? activeSeasons[0];
    setForm({ name: "", season_id: defaultSeason?.id ?? 0 });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    if (!form.season_id) {
      setFormError("Debes seleccionar una temporada");
      return;
    }
    createMutation.mutate(form);
  }

  /** Devuelve el nombre de la temporada dado su id */
  function seasonName(id: number): string {
    return seasons.find((s) => s.id === id)?.name ?? `Temporada ${id}`;
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Equipos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {teams.length} equipo{teams.length !== 1 ? "s" : ""}
              {filterSeasonId !== "all" && (
                <> · {seasonName(Number(filterSeasonId))}</>
              )}
            </p>
          </div>
          {isTD && (
            <Button onClick={openCreate} disabled={activeSeasons.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo equipo
            </Button>
          )}
        </div>

        {/* Filtro por temporada */}
        {seasons.length > 0 && (
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

        {/* Aviso si no hay temporadas */}
        {!seasonsLoading && seasons.length === 0 && isTD && (
          <Alert className="mb-4">
            <AlertDescription>
              Antes de crear equipos, crea al menos una temporada en{" "}
              <a href={`/clubs/${clubId}/seasons`} className="underline font-medium">
                Gestión de temporadas
              </a>
              .
            </AlertDescription>
          </Alert>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : teams.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No hay equipos todavía.</p>
            {isTD && activeSeasons.length > 0 && (
              <Button variant="link" onClick={openCreate}>
                Crea el primero
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {teams.map((team) => (
              <TeamRow
                key={team.id}
                team={team}
                seasonLabel={seasonName(team.season_id)}
                isTD={isTD}
                isArchiving={archiveMutation.isPending && archiveMutation.variables === team.id}
                onArchive={() => archiveMutation.mutate(team.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog crear equipo */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setForm({ name: "", season_id: 0 }); setFormError(null); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo equipo</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Nombre *</Label>
              <Input
                id="team-name"
                placeholder="Cadete A"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Temporada *</Label>
              <Select
                value={form.season_id ? String(form.season_id) : ""}
                onValueChange={(v) => setForm((f) => ({ ...f, season_id: Number(v) }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una temporada" />
                </SelectTrigger>
                <SelectContent>
                  {activeSeasons.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.status === "active" && (
                        <span className="ml-2 text-xs text-muted-foreground">(activa)</span>
                      )}
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
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !form.name.trim() || !form.season_id}
            >
              {createMutation.isPending ? "Creando..." : "Crear equipo"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── TeamRow ───────────────────────────────────────────────────────────────────

function TeamRow({
  team,
  seasonLabel,
  isTD,
  isArchiving,
  onArchive,
}: {
  team: Team;
  seasonLabel: string;
  isTD: boolean;
  isArchiving: boolean;
  onArchive: () => void;
}) {
  return (
    <div className="flex items-center gap-4 px-4 py-3 group">
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
        {team.name.charAt(0).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm">
          {team.name}
          {team.archived_at && (
            <Badge variant="secondary" className="ml-2 text-xs">
              Archivado
            </Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{seasonLabel}</p>
      </div>

      {isTD && !team.archived_at && (
        <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={isArchiving}
                aria-label={`Archivar equipo ${team.name}`}
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Archivar equipo?</AlertDialogTitle>
                <AlertDialogDescription>
                  El equipo <strong>{team.name}</strong> quedará archivado y ya no
                  aparecerá en los selectores activos.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={onArchive}>Archivar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
