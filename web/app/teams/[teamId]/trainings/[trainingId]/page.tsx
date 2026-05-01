"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, CheckCircle2, XCircle, ChevronUp, ChevronDown } from "lucide-react";
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
} from "@basketball-clipper/shared/api";
import type { DrillType, TrainingDrill, TrainingDrillAdd } from "@basketball-clipper/shared/types";
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

type TabKey = "ejercicios" | "asistencia";
type AddMode = "library" | "catalog" | "new";

const DRILL_TYPES: { value: DrillType; label: string }[] = [
  { value: "drill", label: "Ejercicio" },
  { value: "play", label: "Jugada" },
];

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

  // Drills already in training
  const drillIdsInTraining = new Set(
    training?.training_drills.map((td) => td.drill_id) ?? []
  );

  const availableLibraryDrills = myDrills.filter(
    (d) => !drillIdsInTraining.has(d.id) && !d.archived_at
  );
  const availableCatalogEntries = catalogEntries.filter(
    (e) => !e.archived_at && !drillIdsInTraining.has(e.drill.id)
  );

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

  // Create new drill then add it
  const createAndAddMut = useMutation({
    mutationFn: async () => {
      const drill = await createDrill(token!, {
        name: newDrillName.trim(),
        type: newDrillType,
        court_layout: "half_fiba",
      });
      return addTrainingDrill(token!, clubId!, teamId, trainingId, {
        drill_id: drill.id,
      });
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

  const attendanceMut = useMutation({
    mutationFn: ({ playerId, attended }: { playerId: number; attended: boolean }) =>
      upsertAttendance(token!, clubId!, teamId, trainingId, {
        player_id: playerId,
        attended,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  function openDialog() {
    setAddMode("library");
    setSelectedDrillId("");
    setSelectedCatalogEntryId("");
    setNewDrillName("");
    setNewDrillType("drill");
    setAddDrillOpen(true);
  }

  function closeDialog() {
    setAddDrillOpen(false);
  }

  function handleAdd() {
    if (addMode === "library" && selectedDrillId) {
      addDrillMut.mutate({ drill_id: Number(selectedDrillId) });
    } else if (addMode === "catalog" && selectedCatalogEntryId) {
      const entry = catalogEntries.find((e) => e.id === Number(selectedCatalogEntryId));
      if (entry) {
        addDrillMut.mutate({ drill_id: entry.drill.id });
      }
    } else if (addMode === "new" && newDrillName.trim()) {
      createAndAddMut.mutate();
    }
  }

  const isMutating = addDrillMut.isPending || createAndAddMut.isPending;

  const canSubmit =
    (addMode === "library" && !!selectedDrillId) ||
    (addMode === "catalog" && !!selectedCatalogEntryId) ||
    (addMode === "new" && !!newDrillName.trim());

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

  // Attendance map
  const attendanceMap = new Map(
    training.training_attendances.map((ta) => [ta.player_id, ta])
  );

  const allAttendancePlayers = [
    ...training.training_attendances,
    ...roster
      .filter((re) => !attendanceMap.has(re.player_id) && !re.archived_at)
      .map((re) => ({
        id: -1,
        training_id: trainingId,
        player_id: re.player_id,
        attended: false,
        player_first_name: re.player.first_name,
        player_last_name: re.player.last_name,
      })),
  ];

  const presentCount = training.training_attendances.filter((ta) => ta.attended).length;
  const totalCount = allAttendancePlayers.length;

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
                : `Asistencia (${presentCount}/${totalCount})`}
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
                {training.training_drills.map((td, idx) => (
                  <div key={td.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">
                      {idx + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
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
                    </div>
                    {isCoachOrTD && (
                      <div className="flex flex-col gap-0.5 shrink-0">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          disabled={idx === 0 || reorderMut.isPending}
                          onClick={() => moveRow(training.training_drills, idx, -1)}
                          aria-label="Subir ejercicio"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-6"
                          disabled={idx === training.training_drills.length - 1 || reorderMut.isPending}
                          onClick={() => moveRow(training.training_drills, idx, 1)}
                          aria-label="Bajar ejercicio"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <Link
                      href={`/drills/${td.drill_id}/edit`}
                      className="text-xs text-muted-foreground hover:text-foreground underline shrink-0"
                    >
                      Ver
                    </Link>
                    {isCoachOrTD && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
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
                ))}
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
              <div className="border rounded-lg divide-y">
                {allAttendancePlayers.map((ta) => (
                  <div key={ta.player_id} className="flex items-center gap-3 px-4 py-3">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {ta.player_first_name} {ta.player_last_name}
                      </p>
                    </div>
                    {isCoachOrTD ? (
                      <button
                        className={cn(
                          "flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full transition-colors",
                          ta.attended
                            ? "bg-green-100 text-green-700 hover:bg-green-200"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                        onClick={() =>
                          attendanceMut.mutate({
                            playerId: ta.player_id,
                            attended: !ta.attended,
                          })
                        }
                        disabled={attendanceMut.isPending}
                      >
                        {ta.attended ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {ta.attended ? "Asistió" : "No asistió"}
                      </button>
                    ) : (
                      <Badge variant={ta.attended ? "default" : "secondary"}>
                        {ta.attended ? "Asistió" : "No asistió"}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
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

          {/* Mode selector */}
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
            {/* Library */}
            {addMode === "library" && (
              <div className="space-y-1.5">
                <Label>Ejercicio de mi biblioteca</Label>
                <Select value={selectedDrillId} onValueChange={setSelectedDrillId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un ejercicio" />
                  </SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">
                    No hay ejercicios disponibles en tu biblioteca.
                  </p>
                )}
              </div>
            )}

            {/* Catalog */}
            {addMode === "catalog" && (
              <div className="space-y-1.5">
                <Label>Ejercicio del catálogo del club</Label>
                <Select
                  value={selectedCatalogEntryId}
                  onValueChange={setSelectedCatalogEntryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona del catálogo" />
                  </SelectTrigger>
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
                  <p className="text-xs text-muted-foreground">
                    No hay entradas disponibles en el catálogo del club.
                  </p>
                )}
              </div>
            )}

            {/* New */}
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
                  <Select
                    value={newDrillType}
                    onValueChange={(v) => setNewDrillType(v as DrillType)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DRILL_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
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
            <Button
              onClick={handleAdd}
              disabled={!canSubmit || isMutating}
            >
              {isMutating ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
