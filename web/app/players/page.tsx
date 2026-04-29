"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { UserPlus, Archive, Pencil, Search, Eye, EyeOff, Phone } from "lucide-react";
import {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
  listRoster,
  getTeams,
} from "@basketball-clipper/shared/api";
import type { Player, PlayerCreate } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const EMPTY_FORM: PlayerCreate = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
  position: null,
  photo_url: null,
  phone: null,
};

// ── Avatar ────────────────────────────────────────────────────────────────────

function PlayerAvatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" }) {
  const initials = `${player.first_name[0] ?? ""}${player.last_name[0] ?? ""}`.toUpperCase();
  const dim = size === "sm" ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm";

  if (player.photo_url) {
    return (
      <img
        src={player.photo_url}
        alt={`${player.first_name} ${player.last_name}`}
        className={cn("rounded-full object-cover shrink-0", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground shrink-0",
        dim,
      )}
    >
      {initials}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const { activeProfile, token } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // ── Data ───────────────────────────────────────────────────────────────────

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ["players", clubId, showArchived],
    queryFn: () => listPlayers(token!, clubId!, showArchived),
    enabled: !!token && !!clubId,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", clubId],
    queryFn: () => getTeams(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const activeTeams = teams.filter((t) => !t.archived_at);

  // Fetch roster for every active team in parallel
  const rosterQueries = useQueries({
    queries: activeTeams.map((team) => ({
      queryKey: ["roster", clubId, team.id],
      queryFn: () => listRoster(token!, clubId!, team.id),
      enabled: !!token && !!clubId,
    })),
  });

  // Build map: playerId → team names[]
  const playerTeamsMap = useMemo<Map<number, string[]>>(() => {
    const map = new Map<number, string[]>();
    rosterQueries.forEach((q, idx) => {
      if (!q.data) return;
      const teamName = activeTeams[idx]?.name ?? "";
      q.data.forEach((entry) => {
        if (entry.archived_at) return;
        const existing = map.get(entry.player_id) ?? [];
        map.set(entry.player_id, [...existing, teamName]);
      });
    });
    return map;
  }, [rosterQueries, activeTeams]);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (q && !fullName.includes(q)) return false;
      if (teamFilter === "none") {
        const inAnyTeam = rosterQueries.some((rq) =>
          rq.data?.some((e) => !e.archived_at && e.player_id === p.id) ?? false,
        );
        if (inAnyTeam) return false;
      } else if (teamFilter !== "all") {
        const teamId = Number(teamFilter);
        const inTeam = rosterQueries.some((rq, idx) => {
          if (activeTeams[idx]?.id !== teamId) return false;
          return rq.data?.some((e) => !e.archived_at && e.player_id === p.id) ?? false;
        });
        if (!inTeam) return false;
      }
      return true;
    });
  }, [players, search, teamFilter, rosterQueries, activeTeams]);

  const active = filtered.filter((p) => !p.archived_at);
  const archived = filtered.filter((p) => !!p.archived_at);
  const displayed = showArchived ? filtered : active;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (data: PlayerCreate) => {
      if (editPlayer) return updatePlayer(token!, clubId!, editPlayer.id, data);
      return createPlayer(token!, clubId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", clubId] });
      setDialogOpen(false);
      setEditPlayer(null);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (playerId: number) => archivePlayer(token!, clubId!, playerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players", clubId] }),
  });

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Player) {
    setEditPlayer(p);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth,
      position: p.position,
      photo_url: p.photo_url,
      phone: p.phone,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Jugadores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {active.length} jugador{active.length !== 1 ? "es" : ""} activo{active.length !== 1 ? "s" : ""}
              {archived.length > 0 && ` · ${archived.length} archivado${archived.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo jugador
          </Button>
        </div>

        {/* Search + team filter + archive toggle */}
        <div className="flex gap-2 mb-4 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeTeams.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full sm:w-44 shrink-0">
                <SelectValue placeholder="Todos los equipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {activeTeams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Sin equipo</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Ocultar archivados" : "Mostrar archivados"}
          >
            {showArchived ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {showArchived ? "Ocultar archivados" : "Ver archivados"}
            </span>
          </Button>
        </div>

        {/* Player list */}
        {loadingPlayers ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : displayed.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-3 opacity-40" />
            {search ? (
              <p className="font-medium">No hay jugadores que coincidan con "{search}"</p>
            ) : (
              <>
                <p className="font-medium mb-1">No hay jugadores en el club todavía</p>
                <p className="text-sm mb-4">
                  Añade jugadores para poder asignarlos a equipos y gestionar plantillas.
                </p>
                <Button onClick={openCreate}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Añadir primer jugador
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {displayed.map((p) => {
              const teamNames = playerTeamsMap.get(p.id) ?? [];
              const isArchived = !!p.archived_at;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3",
                    isArchived && "opacity-60",
                  )}
                >
                  {/* Avatar */}
                  <PlayerAvatar player={p} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {p.first_name} {p.last_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {/* Teams */}
                      {teamNames.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {teamNames.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin equipo</span>
                      )}
                      {/* Phone */}
                      {p.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {p.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Archived badge */}
                  {isArchived && <Badge variant="secondary">Archivado</Badge>}

                  {/* Actions — only for active players */}
                  {!isArchived && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(p)}
                        title="Editar jugador"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                            disabled={
                              archiveMutation.isPending &&
                              archiveMutation.variables === p.id
                            }
                            title="Archivar jugador"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Archivar jugador?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>
                                {p.first_name} {p.last_name}
                              </strong>{" "}
                              quedará archivado y dejará de aparecer en los
                              listados activos. Puedes recuperarlo más adelante.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => archiveMutation.mutate(p.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Archivar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog crear / editar jugador */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editPlayer ? "Editar jugador" : "Nuevo jugador"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Avatar preview */}
            {(form.photo_url || editPlayer) && (
              <div className="flex justify-center">
                <PlayerAvatar
                  player={{
                    ...(editPlayer ?? { id: 0, club_id: 0, date_of_birth: null, position: null, phone: null, archived_at: null, created_at: "" }),
                    first_name: form.first_name || editPlayer?.first_name || "?",
                    last_name: form.last_name || editPlayer?.last_name || "?",
                    photo_url: form.photo_url ?? null,
                  }}
                  size="md"
                />
              </div>
            )}

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Nombre *</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Pau"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Apellidos *</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Gasol"
                />
              </div>
            </div>

            {/* Photo URL */}
            <div className="space-y-1.5">
              <Label htmlFor="photo_url">
                Foto{" "}
                <span className="text-muted-foreground font-normal">(URL, opcional)</span>
              </Label>
              <Input
                id="photo_url"
                type="url"
                value={form.photo_url ?? ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, photo_url: e.target.value || null }))
                }
                placeholder="https://ejemplo.com/foto.jpg"
              />
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Teléfono{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
                placeholder="+34 600 000 000"
              />
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={
                saveMutation.isPending ||
                !form.first_name.trim() ||
                !form.last_name.trim()
              }
            >
              {saveMutation.isPending
                ? "Guardando..."
                : editPlayer
                ? "Guardar cambios"
                : "Crear jugador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
