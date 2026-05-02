"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Trash2, Pencil, ChevronUp, ChevronDown, ArrowUpDown } from "lucide-react";
import {
  listPlayers,
  listRoster,
  addToRoster,
  updateRosterEntry,
  removeFromRoster,
  listMatches,
} from "@basketball-clipper/shared/api";
import { ROSTER_POSITION_LABELS } from "@basketball-clipper/shared/types";
import type { RosterEntryCreate, RosterEntryUpdate, RosterPosition, MatchStat } from "@basketball-clipper/shared/types";
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
import { cn } from "@/lib/utils";

const POSITIONS: RosterPosition[] = [
  "point_guard",
  "shooting_guard",
  "small_forward",
  "power_forward",
  "center",
];

type StatKey = keyof Pick<MatchStat, "points" | "minutes" | "assists" | "defensive_rebounds" | "offensive_rebounds" | "steals" | "turnovers" | "fouls">;
type SortColumn = "jersey" | "name" | "position" | StatKey;
type SortDir = "asc" | "desc";
interface SortConfig { column: SortColumn; dir: SortDir; }

const STAT_COLS: { key: StatKey; label: string }[] = [
  { key: "points", label: "PTS" },
  { key: "minutes", label: "MIN" },
  { key: "assists", label: "AST" },
  { key: "defensive_rebounds", label: "RD" },
  { key: "offensive_rebounds", label: "RO" },
  { key: "steals", label: "REC" },
  { key: "turnovers", label: "PÉR" },
  { key: "fouls", label: "FAL" },
];

const POS_ORDER: Record<string, number> = {
  point_guard: 1, shooting_guard: 2, small_forward: 3, power_forward: 4, center: 5,
};

function SortIndicator({ column, sort }: { column: SortColumn; sort: SortConfig }) {
  if (sort.column !== column) return <ArrowUpDown className="h-3 w-3 opacity-25 ml-1 inline" />;
  return sort.dir === "asc"
    ? <ChevronUp className="h-3 w-3 ml-1 inline" />
    : <ChevronDown className="h-3 w-3 ml-1 inline" />;
}

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
  const isCoachOrTD =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const [addOpen, setAddOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<number | null>(null);
  const [addForm, setAddForm] = useState({ playerId: "", jersey: "", position: "none" });
  const [editForm, setEditForm] = useState<RosterEntryUpdate>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortConfig>({ column: "jersey", dir: "asc" });

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

  const { data: matches = [] } = useQuery({
    queryKey: ["matches", teamId, "all"],
    queryFn: () => listMatches(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  // Aggregate match stats per player
  const statsMap = new Map<number, Record<StatKey, number>>();
  for (const match of matches) {
    for (const stat of match.match_stats) {
      const existing = statsMap.get(stat.player_id) ?? {
        points: 0, minutes: 0, assists: 0,
        defensive_rebounds: 0, offensive_rebounds: 0,
        steals: 0, turnovers: 0, fouls: 0,
      };
      statsMap.set(stat.player_id, {
        points: existing.points + (stat.points ?? 0),
        minutes: existing.minutes + (stat.minutes ?? 0),
        assists: existing.assists + (stat.assists ?? 0),
        defensive_rebounds: existing.defensive_rebounds + (stat.defensive_rebounds ?? 0),
        offensive_rebounds: existing.offensive_rebounds + (stat.offensive_rebounds ?? 0),
        steals: existing.steals + (stat.steals ?? 0),
        turnovers: existing.turnovers + (stat.turnovers ?? 0),
        fouls: existing.fouls + (stat.fouls ?? 0),
      });
    }
  }

  const rosterPlayerIds = new Set(roster.map((e) => e.player_id));
  const availablePlayers = allPlayers.filter((p) => !rosterPlayerIds.has(p.id) && !p.archived_at);

  // Sort roster by selected column
  function handleSort(col: SortColumn) {
    setSort((prev) => {
      if (prev.column === col) return { column: col, dir: prev.dir === "asc" ? "desc" : "asc" };
      const defaultDir: SortDir = (col === "jersey" || col === "name" || col === "position") ? "asc" : "desc";
      return { column: col, dir: defaultDir };
    });
  }

  const sortedRoster = [...roster].sort((a, b) => {
    let cmp = 0;
    const { column, dir } = sort;
    if (column === "jersey") {
      cmp = (a.jersey_number ?? 999) - (b.jersey_number ?? 999);
    } else if (column === "name") {
      cmp = `${a.player.first_name} ${a.player.last_name}`.localeCompare(
        `${b.player.first_name} ${b.player.last_name}`,
      );
    } else if (column === "position") {
      const pa = a.position ? (POS_ORDER[a.position] ?? 9) : 9;
      const pb = b.position ? (POS_ORDER[b.position] ?? 9) : 9;
      cmp = pa - pb;
    } else {
      const sa = statsMap.get(a.player_id);
      const sb = statsMap.get(b.player_id);
      const va = sa ? (sa[column as StatKey] as number) : 0;
      const vb = sb ? (sb[column as StatKey] as number) : 0;
      cmp = va - vb;
    }
    return dir === "asc" ? cmp : -cmp;
  });

  const addMutation = useMutation({
    mutationFn: (data: RosterEntryCreate) => addToRoster(token!, clubId!, teamId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] });
      setAddOpen(false);
      setAddForm({ playerId: "", jersey: "", position: "none" });
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
    // #49 — optimistic update: remove roster entry instantly
    onMutate: async (entryId) => {
      await queryClient.cancelQueries({ queryKey: ["roster", clubId, teamId] });
      const snapshot = queryClient.getQueryData(["roster", clubId, teamId]);
      queryClient.setQueryData<typeof roster>(["roster", clubId, teamId], (old) =>
        old?.filter((e) => e.id !== entryId),
      );
      return { snapshot };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.snapshot) queryClient.setQueryData(["roster", clubId, teamId], ctx.snapshot);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["roster", clubId, teamId] }),
  });

  function openEdit(entryId: number) {
    const entry = roster.find((e) => e.id === entryId)!;
    setEditForm({
      jersey_number: entry.jersey_number,
      position: entry.position,
    });
    setFormError(null);
    setEditEntry(entryId);
  }

  const hasStats = matches.length > 0;

  function thClass(col: SortColumn, align?: string) {
    return cn(
      "px-2 py-2 font-medium text-muted-foreground text-xs cursor-pointer select-none hover:text-foreground transition-colors whitespace-nowrap",
      align === "left" ? "text-left" : "text-right",
      sort.column === col && "text-foreground",
    );
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <Breadcrumb items={[
          { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
          { label: activeProfile?.team_name ?? "Equipo", href: `/teams/${teamId}/matches` },
          { label: "Plantilla" },
        ]} />
        <div className="flex items-center justify-between mb-4">
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
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
          </div>
        ) : roster.length === 0 ? (
          <div className="border rounded-lg border-dashed p-14 text-center text-muted-foreground">
            <UserPlus className="h-9 w-9 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">La plantilla está vacía</p>
            <p className="text-xs mb-4">
              {isCoachOrTD
                ? "Asigna jugadores del club a este equipo para gestionar dorsales, posiciones y estadísticas."
                : "El cuerpo técnico aún no ha configurado la plantilla de este equipo."}
            </p>
            {isCoachOrTD && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                Añadir primer jugador
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th
                    className={thClass("jersey", "left")}
                    style={{ paddingLeft: "1rem" }}
                    onClick={() => handleSort("jersey")}
                  >
                    #<SortIndicator column="jersey" sort={sort} />
                  </th>
                  <th
                    className={thClass("name", "left")}
                    onClick={() => handleSort("name")}
                  >
                    Jugador<SortIndicator column="name" sort={sort} />
                  </th>
                  <th
                    className={thClass("position", "left")}
                    onClick={() => handleSort("position")}
                  >
                    Posición<SortIndicator column="position" sort={sort} />
                  </th>
                  {hasStats && STAT_COLS.map(({ key, label }) => (
                    <th
                      key={key}
                      className={thClass(key)}
                      onClick={() => handleSort(key)}
                    >
                      {label}<SortIndicator column={key} sort={sort} />
                    </th>
                  ))}
                  <th className="w-20" />
                </tr>
              </thead>
              <tbody>
                {sortedRoster.map((entry) => {
                  const pStats = statsMap.get(entry.player_id);
                  const photoUrl = entry.player.photo_url;
                  return (
                    <tr key={entry.id} className="border-b last:border-b-0 hover:bg-muted/20">
                      <td className="px-4 py-3 font-mono font-semibold text-muted-foreground">
                        {entry.jersey_number != null ? String(entry.jersey_number).padStart(2, "0") : "--"}
                      </td>
                      <td className="px-2 py-3">
                        <div className="flex items-center gap-2">
                          {photoUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photoUrl}
                              alt={`${entry.player.first_name} ${entry.player.last_name}`}
                              className="h-8 w-8 rounded-full object-cover shrink-0"
                            />
                          ) : (
                            <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                              {entry.player.first_name[0]}{entry.player.last_name[0]}
                            </div>
                          )}
                          <div>
                            <span className="font-medium">
                              {entry.player.first_name} {entry.player.last_name}
                            </span>
                            {entry.player.positions.length > 0 && (
                              <div className="flex gap-1 mt-0.5 flex-wrap">
                                {entry.player.positions.map((pos) => (
                                  <span
                                    key={pos.id}
                                    className="inline-flex items-center rounded px-1.5 py-0 text-xs font-medium text-white"
                                    style={{ backgroundColor: pos.color }}
                                  >
                                    {pos.name}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3 text-muted-foreground">
                        {entry.position ? ROSTER_POSITION_LABELS[entry.position] : "—"}
                      </td>
                      {hasStats && STAT_COLS.map(({ key }) => (
                        <td key={key} className="px-2 py-3 text-right tabular-nums text-muted-foreground text-xs">
                          {pStats ? (pStats[key] as number) : 0}
                        </td>
                      ))}
                      <td className="px-2 py-3">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(entry.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                disabled={removeMutation.isPending && removeMutation.variables === entry.id}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>¿Retirar jugador?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Se retirará a <strong>{entry.player.first_name} {entry.player.last_name}</strong> de la plantilla.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => removeMutation.mutate(entry.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Retirar
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Dialog añadir jugador */}
      <Dialog open={addOpen} onOpenChange={(open) => { setAddOpen(open); if (!open) setFormError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir jugador a la plantilla</DialogTitle>
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
                <Label>Posición</Label>
                <Select value={addForm.position} onValueChange={(v) => setAddForm((f) => ({ ...f, position: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sin posición" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin posición</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{ROSTER_POSITION_LABELS[pos]}</SelectItem>
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
                position: (addForm.position === "none" ? null : addForm.position) as RosterPosition | null,
              })}
            >
              {addMutation.isPending ? "Añadiendo..." : "Añadir"}
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
                <Label>Posición</Label>
                <Select
                  value={editForm.position ?? "none"}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, position: (v === "none" ? null : v) as RosterPosition | null }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sin posición" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin posición</SelectItem>
                    {POSITIONS.map((pos) => (
                      <SelectItem key={pos} value={pos}>{ROSTER_POSITION_LABELS[pos]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
