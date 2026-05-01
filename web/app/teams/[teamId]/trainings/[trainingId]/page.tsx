"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import {
  getTraining,
  addTrainingDrill,
  removeTrainingDrill,
  upsertAttendance,
  listDrills,
  listRoster,
} from "@basketball-clipper/shared/api";
import type { TrainingDrillAdd } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
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
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type TabKey = "ejercicios" | "asistencia";

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
  const [selectedDrillId, setSelectedDrillId] = useState<string>("");

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

  const { data: roster = [] } = useQuery({
    queryKey: ["roster", teamId],
    queryFn: () => listRoster(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  const addDrillMut = useMutation({
    mutationFn: (data: TrainingDrillAdd) =>
      addTrainingDrill(token!, clubId!, teamId, trainingId, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["training", trainingId] });
      toast("Ejercicio añadido al entrenamiento.");
      setAddDrillOpen(false);
      setSelectedDrillId("");
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

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

  // Drills already in training
  const drillIdsInTraining = new Set(training.training_drills.map((td) => td.drill_id));
  const availableDrills = myDrills.filter((d) => !drillIdsInTraining.has(d.id));

  // Attendance map
  const attendanceMap = new Map(
    training.training_attendances.map((ta) => [ta.player_id, ta])
  );

  // Players from roster not yet in attendance list
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
          <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
            <Link href={`/teams/${teamId}/trainings`}>
              <ArrowLeft className="h-4 w-4 mr-1" />
              Entrenamientos
            </Link>
          </Button>
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
              {t === "ejercicios" ? `Ejercicios (${training.training_drills.length})` : `Asistencia (${presentCount}/${totalCount})`}
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
                      <p className="text-sm font-medium">{td.drill_title ?? `Ejercicio #${td.drill_id}`}</p>
                      {td.drill_type && (
                        <p className="text-xs text-muted-foreground capitalize">{td.drill_type}</p>
                      )}
                      {td.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5">{td.notes}</p>
                      )}
                    </div>
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
              <Button variant="outline" size="sm" onClick={() => setAddDrillOpen(true)}>
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
      <Dialog open={addDrillOpen} onOpenChange={setAddDrillOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir ejercicio al entrenamiento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Ejercicio de mi biblioteca</Label>
              <Select value={selectedDrillId} onValueChange={setSelectedDrillId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un ejercicio" />
                </SelectTrigger>
                <SelectContent>
                  {availableDrills.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableDrills.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No hay ejercicios disponibles en tu biblioteca (o todos ya están añadidos).
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddDrillOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => addDrillMut.mutate({ drill_id: Number(selectedDrillId) })}
              disabled={!selectedDrillId || addDrillMut.isPending}
            >
              {addDrillMut.isPending ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
