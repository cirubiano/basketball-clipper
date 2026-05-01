"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { Plus, Trash2, ChevronUp, ChevronDown, Save } from "lucide-react";
import Link from "next/link";
import {
  getTraining,
  addTrainingDrill,
  removeTrainingDrill,
  reorderTrainingDrills,
  upsertAttendance,
  listDrills,
  listRoster,
  listCatalog,
  createDrill,
  getDrill,
} from "@basketball-clipper/shared/api";
import type {
  AbsenceReason,
  DrillType,
  TrainingAttendance,
  TrainingDrill,
  TrainingDrillAdd,
  CourtLayoutType,
  SequenceNode,
  SketchElement,
} from "@basketball-clipper/shared/types";
import { ABSENCE_REASON_LABELS } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { CourtBackground } from "@/components/drill-editor/CourtBackground";
import { ElementRenderer } from "@/components/drill-editor/ElementRenderer";
import { COURT_SIZE, toSvg } from "@/components/drill-editor/court-utils";

type TabKey = "ejercicios" | "asistencia";
type AddMode = "library" | "catalog" | "new";
type AttendanceState = "present" | "late" | "absent";

interface LocalAttendanceRecord {
  state: AttendanceState;
  absence_reason: AbsenceReason | null;
  notes: string;
}

const DRILL_TYPES: { value: DrillType; label: string }[] = [
  { value: "drill", label: "Ejercicio" },
  { value: "play", label: "Jugada" },
];

function taToState(ta: TrainingAttendance): AttendanceState {
  if (!ta.attended) return "absent";
  if (ta.is_late) return "late";
  return "present";
}

function attendanceBadge(state: AttendanceState, absenceReason: AbsenceReason | null) {
  switch (state) {
    case "present":
      return <Badge className="bg-green-600 text-white">Asistió</Badge>;
    case "late":
      return <Badge className="bg-amber-500 text-white">Con retraso</Badge>;
    case "absent":
      return (
        <Badge className="bg-destructive text-destructive-foreground">
          Ausente{absenceReason ? ` · ${ABSENCE_REASON_LABELS[absenceReason]}` : ""}
        </Badge>
      );
  }
}

export default function TrainingDetailPage({
  params,
}: {
  params: { teamId: string; trainingId: string };
}) {
  const teamId = Number(params.teamId);
  const trainingId = Number(params.trainingId);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const clubId = activeProfile?.club_id;
  const isCoachOrTD =
    activeProfile?.role === "head_coach" ||
    activeProfile?.role === "technical_director";

  const [tab, setTab] = useState<TabKey>("ejercicios");
  const [addDrillOpen, setAddDrillOpen] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>("library");

  // Library mode
  const [selectedDrillId, setSelectedDrillId] = useState<string>("");
  // Catalog mode
  const [selectedCatalogEntryId, setSelectedCatalogEntryId] = useState<string>("");
  // New mode
  const [newDrillName, setNewDrillName] = useState("");
  const [newDrillType, setNewDrillType] = useState<DrillType>("drill");

  // Local attendance state — richer than boolean
  const [localAttendance, setLocalAttendance] = useState<Map<number, LocalAttendanceRecord>>(
    new Map()
  );
  const [attendanceDirty, setAttendanceDirty] = useState(false);

  const { data: training, isLoading } = useQuery({
    queryKey: ["training", trainingId],
    queryFn: () => getTraining(token!, clubId!, teamId, trainingId),
    enabled: !!token && !!clubId,
  });

  const { data: myDrills = [] } = useQuery({
    queryKey: ["drills"],
    queryFn: () => listDrills(token!),
    enabled: !!token,
  });

  const { data: catalogEntries = [] } = useQuery({
    queryKey: ["catalog", clubId],
    queryFn: () => listCatalog(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  // Fetch drill details for thumbnails
  const drillIds = training?.training_drills.map((td) => td.drill_id) ?? [];
  const drillDetailQueries = useQueries({
    queries: drillIds.map((id) => ({
      queryKey: ["drill", id],
      queryFn: () => getDrill(token!, id),
      enabled: !!token && !!id,
    })),
  });
  const drillDetailMap = new Map(
    drillDetailQueries
      .filter((q) => q.data)
      .map((q) => [q.data!.id, q.data!]),
  );

  const drillIdsInTraining = new Set(
    training?.training_drills.map((td) => td.drill_id) ?? []
  );

  const availableLibraryDrills = myDrills.filter(
    (d) => !drillIdsInTraining.has(d.id) && !d.archived_at
  );
  const availableCatalogEntries = catalogEntries.filter(
    (e) => !e.archived_at && !drillIdsInTraining.has(e.drill.id)
  );

  // Build attendance player list: recorded first, then roster defaults (present)
  const attendanceMap = new Map(
    training?.training_attendances.map((ta) => [ta.player_id, ta]) ?? []
  );

  const allAttendancePlayers: TrainingAttendance[] = training ? [
    ...training.training_attendances,
    ...roster
      .filter((re) => !attendanceMap.has(re.player_id) && !re.archived_at)
      .map((re) => ({
        id: -1,
        training_id: trainingId,
        player_id: re.player_id,
        attended: true,
        is_late: false,
        absence_reason: null,
        notes: null,
        player_first_name: re.player.first_name,
        player_last_name: re.player.last_name,
      })),
  ] : [];

  // Sync local state when training loads (only if not dirty)
  useEffect(() => {
    if (allAttendancePlayers.length > 0 && !attendanceDirty) {
      const map = new Map<number, LocalAttendanceRecord>();
      for (const ta of allAttendancePlayers) {
        map.set(ta.player_id, {
          state: taToState(ta),
          absence_reason: ta.absence_reason,
          notes: ta.notes ?? "",
        });
      }
      setLocalAttendance(map);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [training]);

  function updateAttendance(playerId: number, updates: Partial<LocalAttendanceRecord>) {
    setLocalAttendance((prev) => {
      const next = new Map(prev);
      const current = next.get(playerId) ?? { state: "present" as AttendanceState, absence_reason: null, notes: "" };
      next.set(playerId, { ...current, ...updates });
      return next;
    });
    setAttendanceDirty(true);
  }

  const presentCount = Array.from(localAttendance.values()).filter((r) => r.state === "present").length;
  const lateCount = Array.from(localAttendance.values()).filter((r) => r.state === "late").length;
  const absentCount = Array.from(localAttendance.values()).filter((r) => r.state === "absent").length;
  const totalCount = allAttendancePlayers.length;

  // ── Drill mutations ───────────────────────────────────────────────────────────

  const addDrillMut = useMutation({
    mutationFn: (data: TrainingDrillAdd) =>
      addTrainingDrill(token!, clubId!, teamId, trainingId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
      toast("Ejercicio añadido al entrenamiento.");
      closeDialog();
    },
    onError: (e: Error) => {
      toast(e.message.includes("409") || e.message.includes("ya está")
        ? "Este ejercicio ya está en el entrenamiento."
        : e.message, "error");
    },
  });

  const createAndAddMut = useMutation({
    mutationFn: async () => {
      const drill = await createDrill(token!, {
        name: newDrillName.trim(),
        type: newDrillType,
        court_layout: "half_fiba",
      });
      return addTrainingDrill(token!, clubId!, teamId, trainingId, { drill_id: drill.id });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
      void qc.invalidateQueries({ queryKey: ["drills"] });
      toast("Ejercicio creado y añadido al entrenamiento.");
      closeDialog();
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  const reorderMut = useMutation({
    mutationFn: (items: Array<{ drill_id: number; position: number }>) =>
      reorderTrainingDrills(token!, clubId!, teamId, trainingId, items),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  function moveRow(drills: TrainingDrill[], idx: number, dir: -1 | 1) {
    const copy = [...drills];
    const other = idx + dir;
    [copy[idx], copy[other]] = [copy[other], copy[idx]];
    const items = copy.map((td, i) => ({ drill_id: td.drill_id, position: i }));
    reorderMut.mutate(items);
  }

  const removeDrillMut = useMutation({
    mutationFn: (tdId: number) =>
      removeTrainingDrill(token!, clubId!, teamId, trainingId, tdId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
      toast("Ejercicio eliminado.");
    },
  });

  // ── Attendance mutation ───────────────────────────────────────────────────────

  const saveAttendanceMut = useMutation({
    mutationFn: async () => {
      // Validate: absent players need absence_reason
      for (const [, record] of Array.from(localAttendance.entries())) {
        if (record.state === "absent" && !record.absence_reason) {
          throw new Error("Selecciona el motivo de ausencia para todos los jugadores ausentes.");
        }
      }
      const promises = Array.from(localAttendance.entries()).map(([playerId, record]) => {
        const attended = record.state !== "absent";
        const is_late = record.state === "late";
        return upsertAttendance(token!, clubId!, teamId, trainingId, {
          player_id: playerId,
          attended,
          is_late,
          absence_reason: record.state === "absent" ? record.absence_reason : null,
          notes: record.notes || null,
        });
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
      setAttendanceDirty(false);
      toast("Asistencia guardada.");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // ── Dialog helpers ────────────────────────────────────────────────────────────

  function openDialog() {
    setAddMode("library");
    setSelectedDrillId("");
    setSelectedCatalogEntryId("");
    setNewDrillName("");
    setNewDrillType("drill");
    setAddDrillOpen(true);
  }

  function closeDialog() { setAddDrillOpen(false); }

  function handleAdd() {
    if (addMode === "library" && selectedDrillId) {
      addDrillMut.mutate({ drill_id: Number(selectedDrillId) });
    } else if (addMode === "catalog" && selectedCatalogEntryId) {
      const entry = catalogEntries.find((e) => e.id === Number(selectedCatalogEntryId));
      if (entry) addDrillMut.mutate({ drill_id: entry.drill.id });
    } else if (addMode === "new" && newDrillName.trim()) {
      createAndAddMut.mutate();
    }
  }

  const isMutating = addDrillMut.isPending || createAndAddMut.isPending;
  const canSubmit =
    (addMode === "library" && !!selectedDrillId) ||
    (addMode === "catalog" && !!selectedCatalogEntryId) ||
    (addMode === "new" && !!newDrillName.trim());

  // ── Render ────────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <PageShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-64 w-full rounded-lg" />
        </div>
      </PageShell>
    );
  }

  if (!training) {
    return (
      <PageShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl text-center text-muted-foreground">
          <p>Entrenamiento no encontrado.</p>
          <Button asChild variant="link">
            <Link href={`/teams/${teamId}/trainings`}>Volver</Link>
          </Button>
        </div>
      </PageShell>
    );
  }

  const dateStr = new Date(training.date).toLocaleDateString("es-ES", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const timeStr = new Date(training.date).toLocaleTimeString("es-ES", {
    hour: "2-digit", minute: "2-digit",
  });

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="mb-6">
          <Breadcrumb
            className="mb-4"
            items={[
              { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
              { label: activeProfile?.team_name ?? "Equipo", href: `/teams/${teamId}/trainings` },
              { label: "Entrenamientos", href: `/teams/${teamId}/trainings` },
              { label: training.title },
            ]}
          />
          <h1 className="text-2xl font-bold">{training.title}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {dateStr} · {timeStr}
          </p>
          {training.notes && (
            <p className="text-sm text-muted-foreground mt-1">{training.notes}</p>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b mb-6">
          {(["ejercicios", "asistencia"] as TabKey[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                tab === t
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t === "ejercicios"
                ? `Ejercicios (${training.training_drills.length})`
                : `Asistencia (${totalCount})`}
            </button>
          ))}
        </div>

        {/* Tab: Ejercicios */}
        {tab === "ejercicios" && (
          <div>
            {training.training_drills.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm mb-4">
                No hay ejercicios planificados.
              </div>
            ) : (
              <div className="border rounded-lg divide-y mb-4">
                {training.training_drills.map((td, idx) => {
                  const drillDetail = drillDetailMap.get(td.drill_id);
                  return (
                    <div key={td.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">
                        {idx + 1}.
                      </span>

                      {drillDetail ? (
                        <Link href={`/drills/${td.drill_id}/edit`} className="shrink-0">
                          <DrillThumbnail
                            layout={drillDetail.court_layout}
                            node={drillDetail.root_sequence}
                          />
                        </Link>
                      ) : (
                        <div className="w-20 h-[60px] rounded border border-muted bg-muted/30 shrink-0" />
                      )}

                      <div className="flex-1 min-w-0">
                        <Link href={`/drills/${td.drill_id}/edit`} className="block hover:underline">
                          <p className="text-sm font-medium">
                            {td.drill_title ?? `Ejercicio #${td.drill_id}`}
                          </p>
                          {td.drill_type && (
                            <p className="text-xs text-muted-foreground">
                              {td.drill_type === "play" ? "Jugada" : "Ejercicio"}
                            </p>
                          )}
                          {td.notes && (
                            <p className="text-xs text-muted-foreground mt-0.5">{td.notes}</p>
                          )}
                        </Link>
                      </div>

                      {isCoachOrTD && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <Button
                            variant="ghost" size="icon" className="h-5 w-6"
                            disabled={idx === 0 || reorderMut.isPending}
                            onClick={() => moveRow(training.training_drills, idx, -1)}
                            aria-label="Subir ejercicio"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost" size="icon" className="h-5 w-6"
                            disabled={idx === training.training_drills.length - 1 || reorderMut.isPending}
                            onClick={() => moveRow(training.training_drills, idx, 1)}
                            aria-label="Bajar ejercicio"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </div>
                      )}

                      {isCoachOrTD && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                              disabled={removeDrillMut.isPending}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>¿Eliminar ejercicio?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Se eliminará <strong>{td.drill_title}</strong> del entrenamiento.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => removeDrillMut.mutate(td.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Eliminar
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {isCoachOrTD && (
              <Button variant="outline" size="sm" onClick={openDialog}>
                <Plus className="h-4 w-4 mr-1.5" />
                Añadir ejercicio
              </Button>
            )}
          </div>
        )}

        {/* Tab: Asistencia */}
        {tab === "asistencia" && (
          <div>
            {allAttendancePlayers.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                No hay jugadores en la plantilla del equipo.
              </div>
            ) : (
              <>
                {/* Summary bar */}
                <div className="flex gap-3 text-xs text-muted-foreground mb-3">
                  <span className="text-green-700 font-medium">{presentCount} presentes</span>
                  <span>·</span>
                  <span className="text-amber-600 font-medium">{lateCount} con retraso</span>
                  <span>·</span>
                  <span className="text-destructive font-medium">{absentCount} ausentes</span>
                </div>

                <div className="border rounded-lg divide-y mb-4">
                  {allAttendancePlayers.map((ta) => {
                    const record = localAttendance.get(ta.player_id) ?? {
                      state: "present" as AttendanceState,
                      absence_reason: null,
                      notes: "",
                    };
                    return (
                      <div key={ta.player_id} className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-xs font-semibold text-muted-foreground shrink-0">
                            {(ta.player_first_name?.[0] ?? "").toUpperCase()}
                            {(ta.player_last_name?.[0] ?? "").toUpperCase()}
                          </div>
                          {/* Name */}
                          <p className="text-sm font-medium flex-1">
                            {ta.player_first_name} {ta.player_last_name}
                          </p>
                          {/* 3-state control or badge */}
                          {isCoachOrTD ? (
                            <div className="inline-flex rounded-md border overflow-hidden text-xs shrink-0">
                              <button
                                className={cn(
                                  "px-3 py-1.5 transition-colors",
                                  record.state === "present"
                                    ? "bg-green-600 text-white"
                                    : "hover:bg-muted/50 text-muted-foreground",
                                )}
                                onClick={() =>
                                  updateAttendance(ta.player_id, {
                                    state: "present",
                                    absence_reason: null,
                                    notes: "",
                                  })
                                }
                              >
                                Presente
                              </button>
                              <button
                                className={cn(
                                  "px-3 py-1.5 border-l transition-colors",
                                  record.state === "late"
                                    ? "bg-amber-500 text-white"
                                    : "hover:bg-muted/50 text-muted-foreground",
                                )}
                                onClick={() =>
                                  updateAttendance(ta.player_id, {
                                    state: "late",
                                    absence_reason: null,
                                  })
                                }
                              >
                                Retraso
                              </button>
                              <button
                                className={cn(
                                  "px-3 py-1.5 border-l transition-colors",
                                  record.state === "absent"
                                    ? "bg-destructive text-destructive-foreground"
                                    : "hover:bg-muted/50 text-muted-foreground",
                                )}
                                onClick={() =>
                                  updateAttendance(ta.player_id, {
                                    state: "absent",
                                    notes: "",
                                  })
                                }
                              >
                                Ausente
                              </button>
                            </div>
                          ) : (
                            attendanceBadge(record.state, record.absence_reason)
                          )}
                        </div>

                        {/* Conditional fields (coach only) */}
                        {isCoachOrTD && record.state === "late" && (
                          <div className="mt-2 ml-12">
                            <Input
                              className="h-7 text-xs max-w-sm"
                              placeholder="Motivo del retraso (opcional)"
                              value={record.notes}
                              onChange={(e) =>
                                updateAttendance(ta.player_id, { notes: e.target.value })
                              }
                            />
                          </div>
                        )}
                        {isCoachOrTD && record.state === "absent" && (
                          <div className="mt-2 ml-12 flex flex-wrap gap-2">
                            <div className="flex-1 min-w-32">
                              <Label className="text-xs text-muted-foreground mb-1 block">
                                Motivo *
                              </Label>
                              <Select
                                value={record.absence_reason ?? "none"}
                                onValueChange={(v) =>
                                  updateAttendance(ta.player_id, {
                                    absence_reason:
                                      v === "none" ? null : (v as AbsenceReason),
                                    notes: v !== "other" ? "" : record.notes,
                                  })
                                }
                              >
                                <SelectTrigger className="h-7 text-xs">
                                  <SelectValue placeholder="Selecciona..." />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="injury">Lesión</SelectItem>
                                  <SelectItem value="personal">Personal</SelectItem>
                                  <SelectItem value="sanction">Sanción</SelectItem>
                                  <SelectItem value="other">Otro</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {record.absence_reason === "other" && (
                              <div className="flex-1 min-w-40">
                                <Label className="text-xs text-muted-foreground mb-1 block">
                                  Notas (opcional)
                                </Label>
                                <Input
                                  className="h-7 text-xs"
                                  placeholder="Descripción..."
                                  value={record.notes}
                                  onChange={(e) =>
                                    updateAttendance(ta.player_id, { notes: e.target.value })
                                  }
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {isCoachOrTD && (
                  <Button
                    onClick={() => saveAttendanceMut.mutate()}
                    disabled={saveAttendanceMut.isPending || !attendanceDirty}
                    className="w-full sm:w-auto"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    {saveAttendanceMut.isPending ? "Guardando..." : "Guardar asistencia"}
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Add drill dialog */}
      <Dialog open={addDrillOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir ejercicio al entrenamiento</DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 border-b -mx-6 px-6 pb-0">
            {(["library", "catalog", "new"] as AddMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setAddMode(m)}
                className={cn(
                  "px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors",
                  addMode === m
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {m === "library" && "Mi biblioteca"}
                {m === "catalog" && "Catálogo del club"}
                {m === "new" && "Crear nuevo"}
              </button>
            ))}
          </div>

          <div className="space-y-4 py-2">
            {addMode === "library" && (
              <div className="space-y-1.5">
                <Label>Ejercicio de mi biblioteca</Label>
                <Select value={selectedDrillId} onValueChange={setSelectedDrillId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona un ejercicio" /></SelectTrigger>
                  <SelectContent>
                    {availableLibraryDrills.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({d.type === "play" ? "Jugada" : "Ejercicio"})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableLibraryDrills.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay ejercicios disponibles en tu biblioteca.</p>
                )}
              </div>
            )}

            {addMode === "catalog" && (
              <div className="space-y-1.5">
                <Label>Ejercicio del catálogo del club</Label>
                <Select value={selectedCatalogEntryId} onValueChange={setSelectedCatalogEntryId}>
                  <SelectTrigger><SelectValue placeholder="Selecciona del catálogo" /></SelectTrigger>
                  <SelectContent>
                    {availableCatalogEntries.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.drill.name}
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({e.drill.type === "play" ? "Jugada" : "Ejercicio"})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableCatalogEntries.length === 0 && (
                  <p className="text-xs text-muted-foreground">No hay entradas disponibles en el catálogo del club.</p>
                )}
              </div>
            )}

            {addMode === "new" && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="new-drill-name">Nombre *</Label>
                  <Input
                    id="new-drill-name"
                    placeholder="Nombre del ejercicio"
                    value={newDrillName}
                    onChange={(e) => setNewDrillName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Tipo *</Label>
                  <Select value={newDrillType} onValueChange={(v) => setNewDrillType(v as DrillType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DRILL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  Se creará en tu biblioteca personal y se añadirá al entrenamiento.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!canSubmit || isMutating}>
              {isMutating ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── DrillThumbnail ────────────────────────────────────────────────────────────

function DrillThumbnail({
  layout,
  node,
}: {
  layout: CourtLayoutType;
  node: SequenceNode;
}) {
  const { w, h } = COURT_SIZE[layout];
  return (
    <div className="w-20 h-[60px] rounded border border-muted overflow-hidden bg-zinc-800 shrink-0">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="w-full h-full"
        preserveAspectRatio="xMidYMid meet"
      >
        <CourtBackground layout={layout} />
        {node.elements.map((el: SketchElement) => {
          const { x: svgX, y: svgY } = toSvg(el.x, el.y, layout);
          const svgPoints = el.points?.map((p) => ({ x: p.x * w, y: p.y * h }));
          return (
            <ElementRenderer
              key={el.id}
              element={el}
              svgX={svgX}
              svgY={svgY}
              selected={false}
              onPointerDown={() => {}}
              svgPoints={svgPoints}
            />
          );
        })}
      </svg>
    </div>
  );
}
