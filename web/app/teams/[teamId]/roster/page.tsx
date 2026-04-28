"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Pencil } from "lucide-react";
import {
  listPlayers,
  listRoster,
  addToRoster,
  updateRosterEntry,
  removeFromRoster,
} from "@basketball-clipper/shared/api";
import { POSITION_LABELS } from "@basketball-clipper/shared/types";
import type { RosterEntryCreate, RosterEntryUpdate, PlayerPosition } from "@basketball-clipper/shared/types";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";

const POSITIONS: PlayerPosition[] = [
  "point_guard",
  "shooting_guard",
  "small_forward",
  "power_forward",
  "center",
];

export default function RosterPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId: teamIdStr } = params;
  const teamId = Number(teamIdStr);
  const { activeProfile, token } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ playerId: "", jersey: "", position: "" });
  const [editForm, setEditForm] = useState<RosterEntryUpdate>({});
  const [formError, setFormError] = useState<string | null>(null);

  const { data: roster = [], isLoading: rosterLoading } = useQuery({
    queryKey: ["roster", clubId, teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  const { data: allPlayers = [] } = useQuery({
    queryKey: ["players", clubId],
    queryFn: () => listPlayers(token!, clubId!),
    enabled: !!token && !!clubId && addOpen,
  });

  const rosterPlayerIds = new Set(roster.map((e) => e.player_id));
  const availablePlayers = allPlayers.filter((p) => !rosterPlayerIds.has(p.id) && !p.archived_at);

  const addMutation = useMutation({
    mutationFn: (data: RosterEntryCreate) => addToRoster(token!, clubId!, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] });
      setAddOpen(false);
      setAddForm({ playerId: "", jersey: "", position: "" });
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const updateMutation = useMutation({
    mutationFn: ({ entryId, data }: { entryId: number; data: RosterEntryUpdate }) =>
      updateRosterEntry(token!, clubId!, teamId, entryId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] });
      setEditEntry(null);
      setEditForm({});
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const removeMutation = useMutation({
    mutationFn: (entryId: number) => removeFromRoster(token!, clubId!, teamId, entryId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] }),
  });

  function openEdit(entryId: number) {
    const entry = roster.find((e) => e.id === entryId)!;
    setEditForm({
      jersey_number: entry.jersey_number,
      position: entry.position,
      points_per_game: entry.points_per_game,
      rebounds_per_game: entry.rebounds_per_game,
      assists_per_game: entry.assists_per_game,
      minutes_per_game: entry.minutes_per_game,
    });
    setFormError(null);
    setEditEntry(entryId);
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Plantilla</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {roster.length} jugador{roster.length !== 1 ? "es" : ""} en la plantilla
            </p>
          </div>
          <Button onClick={() => { setAddOpen(true); setFormError(null); }}>
            <UserPlus className="h-4 w-4 mr-2" />
            Añadir jugador
          </Button>
        </div>

        {rosterLoading ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : roster.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>La plantilla esta vacia.</p>
            <Button variant="link" onClick={() => setAddOpen(true)}>
              Anade el primer jugador
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {roster.map((entry) => (
              <div key={entry.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-8 text-center font-mono text-sm font-semibold text-muted-foreground shrink-0">
                  {entry.jersey_number != null ? String(entry.jersey_number).padStart(2, "0") : "--"}
                </div>
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                  {entry.player.first_name[0]}{entry.player.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {entry.player.first_name} {entry.player.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.position ? POSITION_LABELS[entry.position] : "Sin posicion"}
                    {entry.points_per_game != null && (
                      <span> &middot; {entry.points_per_game} ppg &middot; {entry.rebounds_per_game} rpg &middot; {entry.assists_per_game} apg</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry.id)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => removeMutation.mutate(entry.id)}
                    disabled={removeMutation.isPending && removeMutation.variables === entry.id}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog anadir jugador */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setFormError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Anadir jugador a la plantilla</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label>Jugador</Label>
              <Select value={addForm.playerId} onValueChange={(v) => setAddForm((f) => ({ ...f, playerId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecciona un jugador" /></SelectTrigger>
                <SelectContent>
                  {availablePlayers.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.first_name} {p.last_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="jersey">Dorsal</Label>
                <Input
                  id="jersey"
                  type="number"
                  min={0}
                  max={99}
                  placeholder="4"
                  value={addForm.jersey}
                  onChange={(e) => setAddForm((f) => ({ ...f, jersey: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Posicion</Label>
                <Select value={addForm.position} onValueChange={(v) => setAddForm((f) => ({ ...f, position: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sin posicion" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin posicion</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{POSITION_LABELS[pos]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button
              disabled={addMutation.isPending || !addForm.playerId}
              onClick={() => addMutation.mutate({
                player_id: Number(addForm.playerId),
                jersey_number: addForm.jersey ? Number(addForm.jersey) : null,
                position: (addForm.position || null) as PlayerPosition | null,
              })}
            >
              {addMutation.isPending ? "Anadiendo..." : "Anadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog editar entrada */}
      <Dialog open={editEntry !== null} onOpenChange={(open) => { if (!open) { setEditEntry(null); setFormError(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar datos de plantilla</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="e_jersey">Dorsal</Label>
                <Input
                  id="e_jersey"
                  type="number"
                  min={0}
                  max={99}
                  value={editForm.jersey_number ?? ""}
                  onChange={(e) => setEditForm((f) => ({ ...f, jersey_number: e.target.value ? Number(e.target.value) : null }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Posicion</Label>
                <Select
                  value={editForm.position ?? ""}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, position: (v || null) as PlayerPosition | null }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sin posicion" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Sin posicion</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{POSITION_LABELS[pos]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estadisticas (media por partido)</p>
            <div className="grid grid-cols-2 gap-3">
              {(["points_per_game", "rebounds_per_game", "assists_per_game", "minutes_per_game"] as const).map((stat) => {
                const labels = { points_per_game: "Puntos", rebounds_per_game: "Rebotes", assists_per_game: "Asistencias", minutes_per_game: "Minutos" };
                return (
                  <div key={stat} className="space-y-1.5">
                    <Label htmlFor={stat}>{labels[stat]}</Label>
                    <Input
                      id={stat}
                      type="number"
                      min={0}
                      step={0.1}
                      value={editForm[stat] ?? ""}
                      onChange={(e) => setEditForm((f) => ({ ...f, [stat]: e.target.value ? Number(e.target.value) : null }))}
                    />
                  </div>
                );
              })}
            </div>
            {formError && <Alert variant="destructive"><AlertDescription>{formError}</AlertDescription></Alert>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditEntry(null)}>Cancelar</Button>
            <Button
              disabled={updateMutation.isPending}
              onClick={() => editEntry !== null && updateMutation.mutate({ entryId: editEntry, data: editForm })}
            >
              {updateMutation.isPending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
