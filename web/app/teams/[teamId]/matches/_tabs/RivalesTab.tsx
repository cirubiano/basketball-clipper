"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Archive, ChevronDown, ChevronRight, Pencil, Hash } from "lucide-react";
import {
  listOpponents,
  getOpponent,
  createOpponent,
  updateOpponent,
  archiveOpponent,
  addOpponentPlayer,
  updateOpponentPlayer,
  archiveOpponentPlayer,
  bulkAddOpponentPlayers,
} from "@basketball-clipper/shared/api";
import type {
  OpponentTeam,
  OpponentTeamSummary,
  OpponentPlayer,
} from "@basketball-clipper/shared/types";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
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
import { Skeleton } from "@/components/ui/skeleton";

const DEFAULT_COLOR = "#6366f1";

export default function RivalesTab({ teamId: _teamId }: { teamId: number }) {
  const { token, activeProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clubId = activeProfile?.club_id ?? 0;

  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Team form state
  const [showCreateTeam, setShowCreateTeam] = useState(false);
  const [editTeam, setEditTeam] = useState<OpponentTeamSummary | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamNotes, setTeamNotes] = useState("");
  const [teamColor, setTeamColor] = useState(DEFAULT_COLOR);

  // Single player form state
  const [showAddPlayer, setShowAddPlayer] = useState<number | null>(null);
  const [editPlayer, setEditPlayer] = useState<{ oppId: number; player: OpponentPlayer } | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerJersey, setPlayerJersey] = useState("");
  const [playerPosition, setPlayerPosition] = useState("");

  // Bulk add state
  const [showBulkAdd, setShowBulkAdd] = useState<number | null>(null);
  const [bulkJerseys, setBulkJerseys] = useState("");

  const canEdit =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const { data: opponents = [], isLoading, error } = useQuery<OpponentTeamSummary[]>({
    queryKey: ["opponents", clubId],
    queryFn: () => listOpponents(token!, clubId),
    enabled: !!token && !!clubId,
  });

  const { data: expandedTeam } = useQuery<OpponentTeam>({
    queryKey: ["opponent", clubId, expandedId],
    queryFn: () => getOpponent(token!, clubId, expandedId!),
    enabled: !!token && expandedId !== null,
  });

  const invalidateList = () =>
    queryClient.invalidateQueries({ queryKey: ["opponents", clubId] });
  const invalidateDetail = (id: number) =>
    queryClient.invalidateQueries({ queryKey: ["opponent", clubId, id] });

  const createTeamMut = useMutation({
    mutationFn: () =>
      createOpponent(token!, clubId, {
        name: teamName.trim(),
        notes: teamNotes.trim() || undefined,
        color: teamColor,
      }),
    onSuccess: () => { invalidateList(); setShowCreateTeam(false); toast("Rival creado"); },
    onError: () => toast("Error al crear rival"),
  });

  const updateTeamMut = useMutation({
    mutationFn: () =>
      updateOpponent(token!, clubId, editTeam!.id, {
        name: teamName.trim(),
        notes: teamNotes.trim() || undefined,
        color: teamColor,
      }),
    onSuccess: (data) => {
      invalidateList();
      invalidateDetail(data.id);
      setEditTeam(null);
      toast("Rival actualizado");
    },
    onError: () => toast("Error al actualizar"),
  });

  const archiveTeamMut = useMutation({
    mutationFn: (id: number) => archiveOpponent(token!, clubId, id),
    onSuccess: () => { invalidateList(); toast("Rival archivado"); },
    onError: () => toast("Error al archivar"),
  });

  const addPlayerMut = useMutation({
    mutationFn: (oppId: number) =>
      addOpponentPlayer(token!, clubId, oppId, {
        jersey_number: Number(playerJersey),
        name: playerName.trim() || undefined,
        position: playerPosition.trim() || undefined,
      }),
    onSuccess: (_, oppId) => {
      invalidateDetail(oppId);
      setShowAddPlayer(null);
      toast("Jugador añadido");
    },
    onError: () => toast("Error al añadir jugador"),
  });

  const updatePlayerMut = useMutation({
    mutationFn: () =>
      updateOpponentPlayer(token!, clubId, editPlayer!.oppId, editPlayer!.player.id, {
        name: playerName.trim() || undefined,
        jersey_number: playerJersey ? Number(playerJersey) : undefined,
        position: playerPosition.trim() || undefined,
      }),
    onSuccess: () => {
      invalidateDetail(editPlayer!.oppId);
      setEditPlayer(null);
      toast("Jugador actualizado");
    },
    onError: () => toast("Error al actualizar jugador"),
  });

  const archivePlayerMut = useMutation({
    mutationFn: ({ oppId, pid }: { oppId: number; pid: number }) =>
      archiveOpponentPlayer(token!, clubId, oppId, pid),
    onSuccess: (_, { oppId }) => {
      invalidateDetail(oppId);
      toast("Jugador archivado");
    },
    onError: () => toast("Error al archivar jugador"),
  });

  const bulkAddMut = useMutation({
    mutationFn: ({ oppId, jerseys }: { oppId: number; jerseys: number[] }) =>
      bulkAddOpponentPlayers(token!, clubId, oppId, { jersey_numbers: jerseys }),
    onSuccess: (_, { oppId }) => {
      invalidateDetail(oppId);
      setShowBulkAdd(null);
      setBulkJerseys("");
      toast("Jugadores añadidos");
    },
    onError: () => toast("Error al añadir jugadores"),
  });

  function openCreateTeam() {
    setTeamName("");
    setTeamNotes("");
    setTeamColor(DEFAULT_COLOR);
    setShowCreateTeam(true);
  }

  function openEditTeam(opp: OpponentTeamSummary) {
    setTeamName(opp.name);
    setTeamNotes("");
    setTeamColor(opp.color ?? DEFAULT_COLOR);
    setEditTeam(opp);
  }

  function openAddPlayer(oppId: number) {
    setPlayerJersey("");
    setPlayerName("");
    setPlayerPosition("");
    setShowAddPlayer(oppId);
  }

  function openBulkAdd(oppId: number) {
    setBulkJerseys("");
    setShowBulkAdd(oppId);
  }

  function openEditPlayer(oppId: number, player: OpponentPlayer) {
    setPlayerName(player.name ?? "");
    setPlayerJersey(player.jersey_number != null ? String(player.jersey_number) : "");
    setPlayerPosition(player.position ?? "");
    setEditPlayer({ oppId, player });
  }

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  // Parse bulk jerseys for preview
  const parsedJerseys = bulkJerseys
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter((s) => s !== "")
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 0 && n <= 99);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Rivales del club disponibles para scouting y asignación a partidos.
        </p>
        {canEdit && (
          <Button onClick={openCreateTeam} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Nuevo rival
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>Error al cargar los rivales.</AlertDescription>
        </Alert>
      ) : opponents.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay rivales registrados.</p>
          {canEdit && (
            <p className="text-xs mt-1">
              Añade rivales para poder registrar estadísticas de scouting.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {opponents.map((opp) => {
            const isExpanded = expandedId === opp.id;
            const detail = isExpanded ? expandedTeam : null;
            return (
              <div key={opp.id} className="border rounded-lg bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3">
                  <button
                    className="flex items-center gap-2.5 text-left flex-1"
                    onClick={() => toggleExpand(opp.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                    {/* Color swatch */}
                    <span
                      className="w-3 h-3 rounded-full shrink-0 border border-black/10"
                      style={{ backgroundColor: opp.color ?? DEFAULT_COLOR }}
                    />
                    <span className="font-medium">{opp.name}</span>
                  </button>
                  {canEdit && (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openEditTeam(opp)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Archivar rival</AlertDialogTitle>
                            <AlertDialogDescription>
                              Se archivará &quot;{opp.name}&quot;. Las estadísticas históricas se conservan.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => archiveTeamMut.mutate(opp.id)}
                            >
                              Archivar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t px-4 py-3 bg-muted/30 space-y-2">
                    {!detail ? (
                      <Skeleton className="h-8 w-full" />
                    ) : (
                      <>
                        {detail.notes && (
                          <p className="text-xs text-muted-foreground italic mb-2">{detail.notes}</p>
                        )}
                        {detail.players.length === 0 ? (
                          <p className="text-xs text-muted-foreground">Sin jugadores registrados.</p>
                        ) : (
                          <div className="space-y-1">
                            {[...detail.players].sort((a, b) => (a.jersey_number ?? 999) - (b.jersey_number ?? 999)).map((p) => (
                              <div
                                key={p.id}
                                className="flex items-center justify-between text-sm py-1"
                              >
                                <div className="flex items-center gap-3">
                                  {p.jersey_number != null && (
                                    <span className="w-6 text-center font-mono text-xs text-muted-foreground">
                                      #{p.jersey_number}
                                    </span>
                                  )}
                                  <span>{p.name ?? `#${p.jersey_number}`}</span>
                                  {p.position && (
                                    <span className="text-xs text-muted-foreground">({p.position})</span>
                                  )}
                                </div>
                                {canEdit && (
                                  <div className="flex items-center gap-1">
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6"
                                      onClick={() => openEditPlayer(opp.id, p)}
                                    >
                                      <Pencil className="h-3 w-3" />
                                    </Button>
                                    <AlertDialog>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        >
                                          <Archive className="h-3 w-3" />
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Archivar jugador</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Se archivará a {p.name ?? `#${p.jersey_number}`}. Sus estadísticas históricas se conservan.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                          <AlertDialogAction
                                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                            onClick={() =>
                                              archivePlayerMut.mutate({ oppId: opp.id, pid: p.id })
                                            }
                                          >
                                            Archivar
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-2 mt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => openAddPlayer(opp.id)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Añadir jugador
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs"
                              onClick={() => openBulkAdd(opp.id)}
                            >
                              <Hash className="h-3 w-3 mr-1" />
                              Añadir jugadores
                            </Button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create team dialog */}
      <Dialog open={showCreateTeam} onOpenChange={setShowCreateTeam}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo rival</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre del equipo rival</Label>
              <Input
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="Ej: CB Zaragoza, Real Madrid..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Notas de scouting (opcional)</Label>
              <Input
                value={teamNotes}
                onChange={(e) => setTeamNotes(e.target.value)}
                placeholder="Observaciones generales..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color identificativo</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={teamColor}
                  onChange={(e) => setTeamColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-0.5"
                />
                <span className="text-sm text-muted-foreground font-mono">{teamColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateTeam(false)}>Cancelar</Button>
            <Button
              onClick={() => createTeamMut.mutate()}
              disabled={!teamName.trim() || createTeamMut.isPending}
            >
              {createTeamMut.isPending ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit team dialog */}
      <Dialog open={!!editTeam} onOpenChange={(o) => !o && setEditTeam(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar rival</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={teamName} onChange={(e) => setTeamName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Input value={teamNotes} onChange={(e) => setTeamNotes(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Color identificativo</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={teamColor}
                  onChange={(e) => setTeamColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-0.5"
                />
                <span className="text-sm text-muted-foreground font-mono">{teamColor}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTeam(null)}>Cancelar</Button>
            <Button
              onClick={() => updateTeamMut.mutate()}
              disabled={!teamName.trim() || updateTeamMut.isPending}
            >
              {updateTeamMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add single player dialog */}
      {(() => {
        const existingJerseys = new Set(
          expandedTeam?.players
            .filter((p) => !p.archived_at)
            .map((p) => p.jersey_number) ?? []
        );
        const isDuplicate =
          playerJersey.trim() !== "" &&
          existingJerseys.has(Number(playerJersey));
        return (
          <Dialog open={showAddPlayer !== null} onOpenChange={(o) => !o && setShowAddPlayer(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Añadir jugador rival</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>
                    Dorsal <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    max={99}
                    value={playerJersey}
                    onChange={(e) => setPlayerJersey(e.target.value)}
                    placeholder="0–99"
                  />
                  {isDuplicate && (
                    <p className="text-xs text-destructive">
                      El dorsal #{playerJersey} ya existe en este equipo.
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nombre (opcional)</Label>
                    <Input
                      value={playerName}
                      onChange={(e) => setPlayerName(e.target.value)}
                      placeholder="Nombre del jugador"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Posición (opcional)</Label>
                    <Input
                      value={playerPosition}
                      onChange={(e) => setPlayerPosition(e.target.value)}
                      placeholder="Base, Ala..."
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddPlayer(null)}>Cancelar</Button>
                <Button
                  onClick={() => showAddPlayer !== null && addPlayerMut.mutate(showAddPlayer)}
                  disabled={!playerJersey.trim() || isDuplicate || addPlayerMut.isPending}
                >
                  {addPlayerMut.isPending ? "Guardando..." : "Añadir"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Bulk add players dialog */}
      {(() => {
        const existingBulkJerseys = new Set(
          expandedTeam?.players
            .filter((p) => !p.archived_at)
            .map((p) => p.jersey_number) ?? []
        );
        const newJerseys = parsedJerseys.filter((n) => !existingBulkJerseys.has(n));
        const duplicateJerseys = parsedJerseys.filter((n) => existingBulkJerseys.has(n));
        return (
          <Dialog open={showBulkAdd !== null} onOpenChange={(o) => !o && setShowBulkAdd(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Añadir jugadores</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Dorsales (separados por comas o espacios)</Label>
                  <Input
                    value={bulkJerseys}
                    onChange={(e) => setBulkJerseys(e.target.value)}
                    placeholder="Ej: 4, 7, 11, 14, 23"
                  />
                </div>
                {newJerseys.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground">Nuevos:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {newJerseys.map((n, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium"
                        >
                          #{n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {duplicateJerseys.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-destructive">Ya existen (se omitirán):</p>
                    <div className="flex flex-wrap gap-1.5">
                      {duplicateJerseys.map((n, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center rounded-full bg-destructive/10 text-destructive px-2.5 py-0.5 text-xs font-medium line-through"
                        >
                          #{n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Se crearán {newJerseys.length} jugador{newJerseys.length !== 1 ? "es" : ""}.
                  Podrás editar sus nombres después.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBulkAdd(null)}>Cancelar</Button>
                <Button
                  onClick={() => showBulkAdd !== null && bulkAddMut.mutate({ oppId: showBulkAdd, jerseys: newJerseys })}
                  disabled={newJerseys.length === 0 || bulkAddMut.isPending}
                >
                  {bulkAddMut.isPending ? "Añadiendo..." : `Añadir ${newJerseys.length > 0 ? newJerseys.length : ""} jugadores`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* Edit player dialog */}
      <Dialog open={!!editPlayer} onOpenChange={(o) => !o && setEditPlayer(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar jugador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Dorsal</Label>
              <Input
                type="number"
                min={0}
                max={99}
                value={playerJersey}
                onChange={(e) => setPlayerJersey(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Nombre (opcional)</Label>
                <Input value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Posición (opcional)</Label>
                <Input value={playerPosition} onChange={(e) => setPlayerPosition(e.target.value)} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPlayer(null)}>Cancelar</Button>
            <Button
              onClick={() => updatePlayerMut.mutate()}
              disabled={updatePlayerMut.isPending}
            >
              {updatePlayerMut.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
