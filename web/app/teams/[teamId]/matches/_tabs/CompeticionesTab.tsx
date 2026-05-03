"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trophy, Plus, Archive, Star, ChevronRight, Pencil } from "lucide-react";
import {
  listCompetitions,
  createCompetition,
  updateCompetition,
  archiveCompetition,
  setDefaultCompetition,
  getSeasons,
} from "@basketball-clipper/shared/api";
import type { Competition, CompetitionCreate, CompetitionUpdate, Season, ClockType } from "@basketball-clipper/shared/types";
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

interface CompFormatForm {
  quarters: number;
  minutes_per_quarter: number;
  players_on_court: number;
  bench_size: number;
  clock_type: ClockType;
}

const FIBA_DEFAULTS: CompFormatForm = {
  quarters: 4,
  minutes_per_quarter: 10,
  players_on_court: 5,
  bench_size: 12,
  clock_type: "stopped",
};

interface Props {
  teamId: number;
  onGoToMatches: (competitionId?: number) => void;
}

export default function CompeticionesTab({ teamId, onGoToMatches }: Props) {
  const { token, activeProfile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const clubId = activeProfile?.club_id;

  const [seasonId, setSeasonId] = useState<number | undefined>(undefined);
  const [showCreate, setShowCreate] = useState(false);
  const [editComp, setEditComp] = useState<Competition | null>(null);
  const [formName, setFormName] = useState("");
  const [formDefault, setFormDefault] = useState(false);
  const [formFormat, setFormFormat] = useState<CompFormatForm>(FIBA_DEFAULTS);
  const [saving, setSaving] = useState(false);

  const canEdit =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const { data: seasons = [] } = useQuery<Season[]>({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const activeSeasonId =
    seasonId ??
    seasons.find((s) => s.status === "active")?.id ??
    seasons[0]?.id;

  const { data: competitions = [], isLoading, error } = useQuery<Competition[]>({
    queryKey: ["competitions", teamId, activeSeasonId],
    queryFn: () => listCompetitions(token!, clubId!, teamId, activeSeasonId),
    enabled: !!token && !!teamId && !!clubId,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["competitions", teamId] });

  const createMut = useMutation({
    mutationFn: (data: CompetitionCreate) => createCompetition(token!, clubId!, teamId, data),
    onSuccess: () => { invalidate(); setShowCreate(false); toast("Competición creada"); },
    onError: () => toast("Error al crear competición"),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CompetitionUpdate }) =>
      updateCompetition(token!, clubId!, teamId, id, data),
    onSuccess: () => { invalidate(); setEditComp(null); toast("Competición actualizada"); },
    onError: () => toast("Error al actualizar"),
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveCompetition(token!, clubId!, teamId, id),
    onSuccess: () => { invalidate(); toast("Competición archivada"); },
    onError: () => toast("Error al archivar"),
  });

  const defaultMut = useMutation({
    mutationFn: (id: number) => setDefaultCompetition(token!, clubId!, teamId, id),
    onSuccess: () => { invalidate(); toast("Competición activa actualizada"); },
    onError: () => toast("Error al actualizar"),
  });

  function openCreate() {
    setFormName("");
    setFormDefault(false);
    setFormFormat(FIBA_DEFAULTS);
    setShowCreate(true);
  }

  function openEdit(comp: Competition) {
    setFormName(comp.name);
    setFormFormat({
      quarters: comp.quarters,
      minutes_per_quarter: comp.minutes_per_quarter,
      players_on_court: comp.players_on_court,
      bench_size: comp.bench_size,
      clock_type: comp.clock_type as ClockType,
    });
    setEditComp(comp);
  }

  async function handleCreate() {
    if (!formName.trim() || !activeSeasonId) return;
    setSaving(true);
    try {
      await createMut.mutateAsync({
        season_id: activeSeasonId,
        name: formName.trim(),
        is_default: formDefault,
        ...formFormat,
      });
    } finally { setSaving(false); }
  }

  async function handleUpdate() {
    if (!editComp || !formName.trim()) return;
    setSaving(true);
    try {
      await updateMut.mutateAsync({
        id: editComp.id,
        data: { name: formName.trim(), ...formFormat },
      });
    } finally { setSaving(false); }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <p className="text-sm text-muted-foreground">
          Ligas y torneos del equipo. Haz clic en una competición para ver sus partidos.
        </p>
        {canEdit && (
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nueva competición
          </Button>
        )}
      </div>

      {seasons.length > 1 && (
        <div className="flex items-center gap-3 mb-4">
          <Label className="text-sm text-muted-foreground shrink-0">Temporada:</Label>
          <Select
            value={String(activeSeasonId ?? "")}
            onValueChange={(v) => setSeasonId(Number(v))}
          >
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Selecciona temporada" />
            </SelectTrigger>
            <SelectContent>
              {seasons.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
        </div>
      ) : error ? (
        <Alert variant="destructive">
          <AlertDescription>Error al cargar las competiciones.</AlertDescription>
        </Alert>
      ) : competitions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border rounded-lg border-dashed">
          <Trophy className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No hay competiciones para esta temporada.</p>
          {canEdit && (
            <p className="text-xs mt-1">Crea una competición para organizar los partidos.</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {competitions.map((comp) => (
            <div
              key={comp.id}
              className="flex items-center justify-between border rounded-lg px-4 py-3 bg-card hover:bg-muted/30 transition-colors cursor-pointer"
              onClick={() => onGoToMatches(comp.id)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{comp.name}</span>
                  {comp.is_default && (
                    <Badge variant="secondary" className="text-xs">
                      <Star className="h-3 w-3 mr-1" />
                      Activa
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {comp.match_count} {comp.match_count === 1 ? "partido" : "partidos"}
                  {" · "}{comp.quarters}×{comp.minutes_per_quarter}&apos; · {comp.players_on_court}v{comp.players_on_court}
                  {" · "}tiempo {comp.clock_type === "stopped" ? "parado" : "corrido"}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                {canEdit && !comp.is_default && (
                  <Button
                    variant="ghost" size="sm" className="text-xs h-7"
                    onClick={() => defaultMut.mutate(comp.id)}
                    disabled={defaultMut.isPending}
                    title="Marcar como competición activa"
                  >
                    Activar
                  </Button>
                )}
                {canEdit && (
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(comp)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                )}
                {canEdit && (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Archivar competición</AlertDialogTitle>
                        <AlertDialogDescription>
                          Los partidos asignados a &quot;{comp.name}&quot; no se verán afectados.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => archiveMut.mutate(comp.id)}
                        >
                          Archivar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
                <ChevronRight className="h-4 w-4 text-muted-foreground ml-1" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nueva competición</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="Ej: Liga regular, Copa Navidad..."
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox" id="is_default_create"
                checked={formDefault}
                onChange={(e) => setFormDefault(e.target.checked)}
                className="h-4 w-4"
              />
              <Label htmlFor="is_default_create" className="font-normal cursor-pointer">
                Marcar como competición activa
              </Label>
            </div>
            <FormatFields format={formFormat} onChange={setFormFormat} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={!formName.trim() || saving}>
              {saving ? "Guardando..." : "Crear"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editComp} onOpenChange={(o) => !o && setEditComp(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar competición</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdate()}
              />
            </div>
            <FormatFields format={formFormat} onChange={setFormFormat} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditComp(null)}>Cancelar</Button>
            <Button onClick={handleUpdate} disabled={!formName.trim() || saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FormatFields({
  format,
  onChange,
}: {
  format: CompFormatForm;
  onChange: (f: CompFormatForm) => void;
}) {
  const set = (k: keyof CompFormatForm, v: string | number) =>
    onChange({ ...format, [k]: v });

  return (
    <div className="border rounded-lg p-3 space-y-3 bg-muted/30">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Formato del partido</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Cuartos</Label>
          <Select value={String(format.quarters)} onValueChange={(v) => set("quarters", Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[4, 6, 8].map((q) => <SelectItem key={q} value={String(q)}>{q} cuartos</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Min. por cuarto</Label>
          <Input
            type="number" min={1} max={20} className="h-8 text-xs"
            value={format.minutes_per_quarter}
            onChange={(e) => set("minutes_per_quarter", Math.max(1, Math.min(20, Number(e.target.value))))}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Jugadores en pista</Label>
          <Select value={String(format.players_on_court)} onValueChange={(v) => set("players_on_court", Number(v))}>
            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4×4</SelectItem>
              <SelectItem value="5">5×5</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Total plantilla</Label>
          <Input
            type="number" min={10} max={20} className="h-8 text-xs"
            value={format.bench_size}
            onChange={(e) => set("bench_size", Math.max(10, Math.min(20, Number(e.target.value))))}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Tiempo</Label>
        <Select value={format.clock_type} onValueChange={(v) => set("clock_type", v as ClockType)}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="stopped">Tiempo parado (FIBA)</SelectItem>
            <SelectItem value="running">Tiempo corrido</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
