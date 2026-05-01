"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Dumbbell, Plus, Archive, ChevronRight } from "lucide-react";
import Link from "next/link";
import {
  listTrainings,
  createTraining,
  archiveTraining,
  getSeasons,
} from "@basketball-clipper/shared/api";
import type { Training, TrainingCreate } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
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

type PageTab = "entrenamientos" | "historial";

interface PlayerAttendanceStat {
  player_id: number;
  player_name: string;
  present: number;
  late: number;
  absent: number;
  total: number;
}

export default function TrainingsPage({
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

  const [pageTab, setPageTab] = useState<PageTab>("entrenamientos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [filterSeasonId, setFilterSeasonId] = useState<string>("all");
  const [form, setForm] = useState<TrainingCreate>({ title: "", date: "", season_id: 0 });
  const [formError, setFormError] = useState<string | null>(null);

  const { data: seasons = [], isLoading: seasonsLoading } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: trainings = [], isLoading: trainingsLoading } = useQuery({
    queryKey: ["trainings", teamId, filterSeasonId],
    queryFn: () =>
      listTrainings(
        token!,
        clubId!,
        teamId,
        filterSeasonId !== "all" ? Number(filterSeasonId) : undefined,
      ),
    enabled: !!token && !!clubId,
  });

  const isLoading = seasonsLoading || trainingsLoading;

  // ── Aggregated attendance stats (for Historial tab) ──────────────────────────
  const attendanceStats: PlayerAttendanceStat[] = useMemo(() => {
    const statsMap = new Map<number, PlayerAttendanceStat>();
    for (const t of trainings) {
      for (const ta of t.training_attendances) {
        if (!statsMap.has(ta.player_id)) {
          statsMap.set(ta.player_id, {
            player_id: ta.player_id,
            player_name: `${ta.player_first_name ?? ""} ${ta.player_last_name ?? ""}`.trim(),
            present: 0,
            late: 0,
            absent: 0,
            total: 0,
          });
        }
        const s = statsMap.get(ta.player_id)!;
        s.total++;
        if (!ta.attended) {
          s.absent++;
        } else if (ta.is_late) {
          s.late++;
        } else {
          s.present++;
        }
      }
    }
    return Array.from(statsMap.values()).sort((a, b) => {
      const pctA = a.total > 0 ? (a.present + a.late) / a.total : 0;
      const pctB = b.total > 0 ? (b.present + b.late) / b.total : 0;
      return pctB - pctA;
    });
  }, [trainings]);

  // ── Mutations ─────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: TrainingCreate) => createTraining(token!, clubId!, teamId, data),
    onSuccess: (t) => {
      void qc.invalidateQueries({ queryKey: ["trainings", teamId] });
      toast(`Entrenamiento "${t.title}" creado.`);
      setDialogOpen(false);
      setForm({ title: "", date: "", season_id: 0 });
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMut = useMutation({
    mutationFn: (trainingId: number) => archiveTraining(token!, clubId!, teamId, trainingId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["trainings", teamId] });
      toast("Entrenamiento archivado.");
    },
  });

  function openCreate() {
    const activeSeason = seasons.find((s) => s.status === "active") ?? seasons[0];
    setForm({ title: "", date: "", season_id: activeSeason?.id ?? 0 });
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.title.trim()) { setFormError("El título es obligatorio"); return; }
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
          { label: activeProfile?.club_name ?? "Club", href: `/clubs/${clubId}/teams` },
          { label: activeProfile?.team_name ?? "Equipo" },
          { label: "Entrenamientos" },
        ]} />

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Entrenamientos</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {trainings.length} entrenamiento{trainings.length !== 1 ? "s" : ""}
              {filterSeasonId !== "all" && <> · {seasonName(Number(filterSeasonId))}</>}
            </p>
          </div>
          {isCoachOrTD && (
            <Button onClick={openCreate} disabled={seasons.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Nuevo entrenamiento
            </Button>
          )}
        </div>

        {/* Season filter */}
        {seasons.length > 1 && (
          <div className="mb-4 flex items-center gap-2">
            <Label className="text-sm shrink-0">Temporada</Label>
            <Select value={filterSeasonId} onValueChange={setFilterSeasonId}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Page tabs */}
        <div className="flex gap-1 border-b mb-6">
          {(["entrenamientos", "historial"] as PageTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setPageTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                pageTab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "entrenamientos" ? "Entrenamientos" : "Historial de asistencia"}
            </button>
          ))}
        </div>

        {/* Tab: Entrenamientos */}
        {pageTab === "entrenamientos" && (
          isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : trainings.length === 0 ? (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <Dumbbell className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p>No hay entrenamientos todavía.</p>
              {isCoachOrTD && seasons.length > 0 && (
                <Button variant="link" onClick={openCreate}>Crea el primero</Button>
              )}
            </div>
          ) : (
            <div className="border rounded-lg divide-y">
              {trainings.map((t) => (
                <TrainingRow
                  key={t.id}
                  training={t}
                  seasonName={seasonName(t.season_id)}
                  isCoachOrTD={isCoachOrTD}
                  isArchiving={archiveMut.isPending && archiveMut.variables === t.id}
                  onArchive={() => archiveMut.mutate(t.id)}
                  teamId={teamId}
                />
              ))}
            </div>
          )
        )}

        {/* Tab: Historial de asistencia */}
        {pageTab === "historial" && (
          isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
            </div>
          ) : attendanceStats.length === 0 ? (
            <div className="border rounded-lg p-12 text-center text-muted-foreground">
              <p>No hay datos de asistencia registrados.</p>
              <p className="text-xs mt-1">
                Registra la asistencia en cada entrenamiento para ver el historial.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium">Jugador</th>
                    <th className="text-center px-3 py-2 font-medium w-24 text-green-700">Presencias</th>
                    <th className="text-center px-3 py-2 font-medium w-24 text-amber-600">Retrasos</th>
                    <th className="text-center px-3 py-2 font-medium w-24 text-destructive">Ausencias</th>
                    <th className="text-center px-3 py-2 font-medium w-28">% Asistencia</th>
                  </tr>
                </thead>
                <tbody>
                  {attendanceStats.map((s) => {
                    const pct = s.total > 0
                      ? Math.round(((s.present + s.late) / s.total) * 100)
                      : 0;
                    return (
                      <tr key={s.player_id} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-medium">{s.player_name}</td>
                        <td className="text-center px-3 py-2.5 text-green-700 font-medium">{s.present}</td>
                        <td className="text-center px-3 py-2.5 text-amber-600 font-medium">{s.late}</td>
                        <td className="text-center px-3 py-2.5 text-destructive font-medium">{s.absent}</td>
                        <td className="text-center px-3 py-2.5">
                          <span className={cn(
                            "font-semibold",
                            pct >= 80 ? "text-green-700" : pct >= 60 ? "text-amber-600" : "text-destructive",
                          )}>
                            {pct}%
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({s.present + s.late}/{s.total})
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground text-center py-2 border-t">
                % = (presencias + retrasos) / total registrado · ordenado por % descendente
              </p>
            </div>
          )
        )}
      </div>

      {/* Create dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => { setDialogOpen(open); if (!open) setFormError(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo entrenamiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                placeholder="Entrenamiento de tiro"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="training-date">Fecha y hora *</Label>
              <Input
                id="training-date"
                type="datetime-local"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
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
                  {seasons.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
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
              disabled={createMut.isPending || !form.title.trim() || !form.date || !form.season_id}
            >
              {createMut.isPending ? "Creando..." : "Crear entrenamiento"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── TrainingRow ───────────────────────────────────────────────────────────────

function TrainingRow({
  training,
  seasonName,
  isCoachOrTD,
  isArchiving,
  onArchive,
  teamId,
}: {
  training: Training;
  seasonName: string;
  isCoachOrTD: boolean;
  isArchiving: boolean;
  onArchive: () => void;
  teamId: number;
}) {
  const dateStr = new Date(training.date).toLocaleDateString("es-ES", {
    weekday: "short", day: "2-digit", month: "short", year: "numeric",
  });
  const timeStr = new Date(training.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });
  const drillCount = training.training_drills.length;

  // Attendance summary for the row
  const attended = training.training_attendances.filter((ta) => ta.attended).length;
  const total = training.training_attendances.length;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <Link href={`/teams/${teamId}/trainings/${training.id}`} className="block hover:underline">
          <p className="font-medium text-sm">{training.title}</p>
          <p className="text-xs text-muted-foreground">
            {dateStr} {timeStr} · {drillCount} ejercicio{drillCount !== 1 ? "s" : ""}
            {total > 0 && <> · {attended}/{total} asistentes</>}
            {" · "}{seasonName}
          </p>
        </Link>
      </div>

      <Link
        href={`/teams/${teamId}/trainings/${training.id}`}
        className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
        aria-label={`Ver entrenamiento ${training.title}`}
      >
        <ChevronRight className="h-4 w-4" />
      </Link>

      {isCoachOrTD && !training.archived_at && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost" size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
              disabled={isArchiving}
              aria-label={`Archivar entrenamiento ${training.title}`}
            >
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Archivar entrenamiento?</AlertDialogTitle>
              <AlertDialogDescription>
                El entrenamiento <strong>{training.title}</strong> quedará archivado.
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
