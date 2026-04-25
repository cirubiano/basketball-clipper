"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Archive, Pencil } from "lucide-react";
import {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
} from "@basketball-clipper/shared/api";
import { POSITION_LABELS } from "@basketball-clipper/shared/types";
import type { Player, PlayerCreate, PlayerPosition } from "@basketball-clipper/shared/types";
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
import { Badge } from "@/components/ui/badge";

const POSITIONS: PlayerPosition[] = [
  "point_guard",
  "shooting_guard",
  "small_forward",
  "power_forward",
  "center",
];

const EMPTY_FORM: PlayerCreate = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
  position: null,
};

export default function PlayersPage() {
  const { activeProfile, token } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: players = [], isLoading } = useQuery({
    queryKey: ["players", clubId],
    queryFn: () => listPlayers(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: PlayerCreate) => {
      if (editPlayer) {
        return updatePlayer(token!, clubId!, editPlayer.id, data);
      }
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
    });
    setFormError(null);
    setDialogOpen(true);
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Jugadores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {players.length} jugador{players.length !== 1 ? "es" : ""} en el club
            </p>
          </div>
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo jugador
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : players.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No hay jugadores en el club todavía.</p>
            <Button variant="link" onClick={openCreate}>
              Añade el primero
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {players.map((p) => (
              <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0">
                  {p.first_name[0]}{p.last_name[0]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    {p.first_name} {p.last_name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.date_of_birth ?? "Sin fecha de nacimiento"}
                    {p.position && (
                      <> · {POSITION_LABELS[p.position]}</>
                    )}
                  </p>
                </div>
                {p.archived_at && (
                  <Badge variant="secondary">Archivado</Badge>
                )}
                {!p.archived_at && (
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => openEdit(p)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => archiveMutation.mutate(p.id)}
                      disabled={archiveMutation.isPending && archiveMutation.variables === p.id}
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Dialog crear / editar jugador */}
      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) { setEditPlayer(null); setForm(EMPTY_FORM); setFormError(null); }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editPlayer ? "Editar jugador" : "Nuevo jugador"}</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Nombre</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Pau"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Apellidos</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Gasol"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="dob">Fecha de nacimiento</Label>
              <Input
                id="dob"
                type="date"
                value={form.date_of_birth ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, date_of_birth: e.target.value || null }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Posición</Label>
              <Select
                value={form.position ?? ""}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, position: (v || null) as PlayerPosition | null }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin posición" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Sin posición</SelectItem>
                  {POSITIONS.map((pos) => (
                    <SelectItem key={pos} value={pos}>
                      {POSITION_LABELS[pos]}
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
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.first_name || !form.last_name}
            >
              {saveMutation.isPending ? "Guardando..." : editPlayer ? "Guardar cambios" : "Crear jugador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
