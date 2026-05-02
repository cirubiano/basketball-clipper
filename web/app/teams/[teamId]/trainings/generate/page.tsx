"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Wand2, ChevronRight, ChevronLeft, Check, Dumbbell } from "lucide-react";
import Link from "next/link";
import {
  listDrills,
  listCatalog,
  getSeasons,
  bulkCreateTrainings,
} from "@basketball-clipper/shared/api";
import type {
  DrillSummary,
  TrainingBulkCreate,
  TrainingBulkItem,
} from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3;

const DOW_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const DOW_NAMES = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

interface Config {
  seasonId: string;
  startDate: string;
  weeks: number;
  sessionDurationMin: number;
  days: number[]; // 0=Mon … 6=Sun
  timeHH: string;
  timeMM: string;
}

interface PreviewSession {
  date: Date;
  title: string;
  drills: Array<{ drill_id: number; title: string; duration_minutes: number | null }>;
  totalMin: number;
}

// ── generator algorithm ───────────────────────────────────────────────────────

function generateSessions(
  config: Config,
  pool: DrillSummary[],
  seasonId: number,
): PreviewSession[] {
  const sessions: PreviewSession[] = [];
  const start = new Date(config.startDate + "T00:00:00");
  const startDow = (start.getDay() + 6) % 7; // Monday=0

  const hh = parseInt(config.timeHH, 10) || 18;
  const mm = parseInt(config.timeMM, 10) || 0;

  // For each selected day-of-week find its first occurrence on or after startDate,
  // then schedule config.weeks sessions spaced 7 days apart.
  // This guarantees exactly days.length * weeks sessions regardless of what weekday startDate falls on.
  const sortedDays = [...config.days].sort((a, b) => a - b);
  const allDates: Date[] = [];
  for (const dow of sortedDays) {
    const daysToFirst = (dow - startDow + 7) % 7;
    for (let w = 0; w < config.weeks; w++) {
      const d = new Date(start);
      d.setDate(d.getDate() + daysToFirst + w * 7);
      d.setHours(hh, mm, 0, 0);
      allDates.push(d);
    }
  }
  allDates.sort((a, b) => a.getTime() - b.getTime());

  for (const d of allDates) {
    // Fill session with exercises from pool (round-robin, respect duration limit)
    const sessionDrills: PreviewSession["drills"] = [];
    let remaining = config.sessionDurationMin;
    const drillCount = pool.length;
    if (drillCount === 0) {
      sessions.push({ date: d, title: `Entrenamiento ${sessions.length + 1}`, drills: [], totalMin: 0 });
      continue;
    }

    // Default duration per drill when none is specified
    const defaultMin = Math.max(10, Math.floor(config.sessionDurationMin / Math.min(drillCount, 5)));
    const offset = sessions.length % drillCount; // rotate starting drill

    for (let i = 0; i < drillCount && remaining > 0; i++) {
      const drill = pool[(offset + i) % drillCount];
      const dur = (drill as unknown as { duration_minutes?: number | null }).duration_minutes ?? defaultMin;
      if (dur > remaining && sessionDrills.length > 0) break;
      sessionDrills.push({ drill_id: drill.id, title: drill.name, duration_minutes: dur });
      remaining -= dur;
    }

    const totalMin = sessionDrills.reduce((s, d) => s + (d.duration_minutes ?? 0), 0);
    const dateStr = d.toLocaleDateString("es-ES", { weekday: "short", day: "2-digit", month: "short" });
    sessions.push({
      date: d,
      title: `Entrenamiento — ${dateStr}`,
      drills: sessionDrills,
      totalMin,
    });
  }
  return sessions;
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function GeneratePlanPage({
  params,
}: {
  params: { teamId: string };
}) {
  const teamId = Number(params.teamId);
  const router = useRouter();
  const { token, activeProfile } = useAuth();
  const { toast } = useToast();
  const clubId = activeProfile?.club_id;

  const [step, setStep] = useState<Step>(1);

  const todayStr = new Date().toISOString().slice(0, 10);
  const [config, setConfig] = useState<Config>({
    seasonId: "",
    startDate: todayStr,
    weeks: 4,
    sessionDurationMin: 90,
    days: [0, 2], // Mon + Wed
    timeHH: "18",
    timeMM: "00",
  });

  const [selectedDrillIds, setSelectedDrillIds] = useState<Set<number>>(new Set());
  const [preview, setPreview] = useState<PreviewSession[]>([]);

  // ── data queries ────────────────────────────────────────────────────────────

  const { data: seasons = [], isLoading: loadingSeasons } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const { data: myDrills = [], isLoading: loadingDrills } = useQuery({
    queryKey: ["drills"],
    queryFn: () => listDrills(token!),
    enabled: !!token,
  });

  const { data: catalogEntries = [], isLoading: loadingCatalog } = useQuery({
    queryKey: ["catalog", clubId],
    queryFn: () => listCatalog(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const activeSeason = seasons.find((s) => s.status === "active");

  // Combine library + catalog drills into a deduplicated pool
  const allAvailableDrills = useMemo<DrillSummary[]>(() => {
    const seen = new Set<number>();
    const result: DrillSummary[] = [];
    for (const d of myDrills) {
      if (!d.archived_at && !seen.has(d.id)) { seen.add(d.id); result.push(d); }
    }
    for (const e of catalogEntries) {
      if (!e.archived_at && !seen.has(e.drill.id)) { seen.add(e.drill.id); result.push(e.drill as unknown as DrillSummary); }
    }
    return result;
  }, [myDrills, catalogEntries]);

  const selectedPool = useMemo(
    () => allAvailableDrills.filter((d) => selectedDrillIds.has(d.id)),
    [allAvailableDrills, selectedDrillIds],
  );

  // ── mutations ────────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (data: TrainingBulkCreate) => bulkCreateTrainings(token!, clubId!, teamId, data),
    onSuccess: (trainings) => {
      toast(`${trainings.length} entrenamientos creados.`);
      router.push(`/teams/${teamId}/trainings`);
    },
    onError: (e: Error) => toast(e.message, "error"),
  });

  // ── step navigation ──────────────────────────────────────────────────────────

  function goToStep2() {
    if (!config.seasonId) {
      const active = activeSeason ?? seasons[0];
      if (active) setConfig((c) => ({ ...c, seasonId: String(active.id) }));
    }
    if (config.days.length === 0) { toast("Selecciona al menos un día.", "error"); return; }
    setStep(2);
  }

  function goToStep3() {
    if (selectedDrillIds.size === 0) { toast("Selecciona al menos un ejercicio.", "error"); return; }
    const seasonId = Number(config.seasonId) || activeSeason?.id || seasons[0]?.id;
    if (!seasonId) { toast("No hay temporada activa.", "error"); return; }
    const sessions = generateSessions(config, selectedPool, seasonId);
    setPreview(sessions);
    setStep(3);
  }

  function handleConfirm() {
    const seasonId = Number(config.seasonId) || activeSeason?.id || seasons[0]?.id;
    if (!seasonId) { toast("No hay temporada activa.", "error"); return; }
    const bulk: TrainingBulkCreate = {
      season_id: seasonId,
      trainings: preview.map((s): TrainingBulkItem => ({
        title: s.title,
        date: s.date.toISOString(),
        drills: s.drills.map((d) => ({ drill_id: d.drill_id, duration_minutes: d.duration_minutes })),
      })),
    };
    createMut.mutate(bulk);
  }

  // ── render ────────────────────────────────────────────────────────────────────

  const stepLabels = ["Configuración", "Ejercicios", "Vista previa"];

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        {/* Header */}
        <div className="mb-6">
          <Breadcrumb
            className="mb-4"
            items={[
              { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
              { label: activeProfile?.team_name ?? "Equipo", href: `/teams/${teamId}/trainings` },
              { label: "Entrenamientos", href: `/teams/${teamId}/trainings` },
              { label: "Generar plan" },
            ]}
          />
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-purple-500" />
            Generar plan de entrenamientos
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Configura el plan, elige ejercicios y revisa antes de crear.
          </p>
        </div>

        {/* Step indicators */}
        <div className="flex items-center gap-2 mb-8">
          {stepLabels.map((label, idx) => {
            const s = (idx + 1) as Step;
            const done = step > s;
            const active = step === s;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={cn(
                    "flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold border-2 transition-colors",
                    done && "bg-green-600 border-green-600 text-white",
                    active && "bg-foreground border-foreground text-background",
                    !done && !active && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : s}
                </div>
                <span className={cn("text-xs font-medium hidden sm:block", active ? "text-foreground" : "text-muted-foreground")}>
                  {label}
                </span>
                {idx < 2 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </div>
            );
          })}
        </div>

        {/* ── Step 1: Config ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Fecha de inicio</Label>
                <Input
                  type="date"
                  value={config.startDate}
                  min={todayStr}
                  onChange={(e) => setConfig((c) => ({ ...c, startDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duración del plan (semanas)</Label>
                <Input
                  type="number"
                  min={1}
                  max={52}
                  value={config.weeks}
                  onChange={(e) => setConfig((c) => ({ ...c, weeks: Math.max(1, parseInt(e.target.value) || 1) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Duración por sesión (min)</Label>
                <Input
                  type="number"
                  min={15}
                  max={300}
                  value={config.sessionDurationMin}
                  onChange={(e) => setConfig((c) => ({ ...c, sessionDurationMin: Math.max(15, parseInt(e.target.value) || 60) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Hora de inicio</Label>
                <div className="flex items-center gap-1">
                  <Input
                    type="number" min={0} max={23} className="w-16 text-center"
                    value={config.timeHH}
                    onChange={(e) => setConfig((c) => ({ ...c, timeHH: e.target.value.padStart(2, "0") }))}
                  />
                  <span className="text-muted-foreground">:</span>
                  <Input
                    type="number" min={0} max={59} step={5} className="w-16 text-center"
                    value={config.timeMM}
                    onChange={(e) => setConfig((c) => ({ ...c, timeMM: e.target.value.padStart(2, "0") }))}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Días de entrenamiento</Label>
              <div className="flex gap-1.5 flex-wrap">
                {DOW_LABELS.map((label, i) => (
                  <button
                    key={i}
                    onClick={() =>
                      setConfig((c) => ({
                        ...c,
                        days: c.days.includes(i) ? c.days.filter((d) => d !== i) : [...c.days, i],
                      }))
                    }
                    className={cn(
                      "h-9 w-9 rounded-full text-xs font-semibold border-2 transition-colors",
                      config.days.includes(i)
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:border-foreground",
                    )}
                    title={DOW_NAMES[i]}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {config.days.length === 0 && (
                <p className="text-xs text-destructive">Selecciona al menos un día.</p>
              )}
            </div>

            {/* Season selector */}
            {loadingSeasons ? (
              <Skeleton className="h-9 w-full" />
            ) : seasons.length > 0 && (
              <div className="space-y-1.5">
                <Label>Temporada</Label>
                <div className="flex flex-wrap gap-1.5">
                  {seasons.filter((s) => s.status !== "archived").map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setConfig((c) => ({ ...c, seasonId: String(s.id) }))}
                      className={cn(
                        "px-3 py-1.5 rounded border text-xs transition-colors",
                        (config.seasonId === String(s.id) || (!config.seasonId && s.status === "active"))
                          ? "bg-foreground text-background border-foreground"
                          : "border-border text-muted-foreground hover:border-foreground",
                      )}
                    >
                      {s.name} {s.status === "active" && <span className="text-green-400"> ·  activa</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-3">
                Se crearán{" "}
                <strong>{config.days.length * config.weeks}</strong> sesiones de{" "}
                <strong>{config.sessionDurationMin} min</strong> cada una.
              </p>
              <Button onClick={goToStep2} disabled={config.days.length === 0}>
                Siguiente: Elegir ejercicios
                <ChevronRight className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 2: Exercise pool ─────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Selecciona los ejercicios que el generador usará para rellenar las sesiones.
              Los ejercicios con duración definida se respetan; al resto se les asigna una duración estimada.
            </p>

            {loadingDrills || loadingCatalog ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : allAvailableDrills.length === 0 ? (
              <div className="border rounded-lg p-8 text-center text-muted-foreground text-sm">
                No tienes ejercicios en tu biblioteca ni en el catálogo del club.
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{selectedDrillIds.size} seleccionados de {allAvailableDrills.length}</span>
                  <button
                    className="underline hover:text-foreground"
                    onClick={() =>
                      setSelectedDrillIds(
                        selectedDrillIds.size === allAvailableDrills.length
                          ? new Set()
                          : new Set(allAvailableDrills.map((d) => d.id)),
                      )
                    }
                  >
                    {selectedDrillIds.size === allAvailableDrills.length ? "Deseleccionar todos" : "Seleccionar todos"}
                  </button>
                </div>

                <div className="border rounded-lg divide-y max-h-80 overflow-y-auto">
                  {allAvailableDrills.map((d) => {
                    const checked = selectedDrillIds.has(d.id);
                    const dur = (d as unknown as { duration_minutes?: number | null }).duration_minutes;
                    return (
                      <button
                        key={d.id}
                        onClick={() =>
                          setSelectedDrillIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(d.id)) next.delete(d.id); else next.add(d.id);
                            return next;
                          })
                        }
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/30",
                          checked && "bg-blue-50 dark:bg-blue-950/30",
                        )}
                      >
                        <div
                          className={cn(
                            "h-4 w-4 rounded border-2 shrink-0 flex items-center justify-center transition-colors",
                            checked ? "bg-blue-600 border-blue-600" : "border-border",
                          )}
                        >
                          {checked && <Check className="h-2.5 w-2.5 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{d.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {d.type === "play" ? "Jugada" : "Ejercicio"}
                          </p>
                        </div>
                        {dur ? (
                          <Badge variant="outline" className="text-xs shrink-0">{dur} min</Badge>
                        ) : (
                          <span className="text-xs text-muted-foreground shrink-0">sin duración</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4 mr-1.5" />
                Atrás
              </Button>
              <Button onClick={goToStep3} disabled={selectedDrillIds.size === 0}>
                Generar vista previa
                <Wand2 className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ───────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Revisa el plan generado. Puedes volver atrás para ajustar la configuración.
            </p>

            <div className="text-xs text-muted-foreground flex gap-4">
              <span><strong>{preview.length}</strong> sesiones</span>
              <span><strong>{config.sessionDurationMin} min</strong> por sesión</span>
              <span><strong>{selectedPool.length}</strong> ejercicios en rotación</span>
            </div>

            <div className="border rounded-lg divide-y max-h-[480px] overflow-y-auto">
              {preview.map((session, idx) => (
                <div key={idx} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <p className="text-sm font-semibold">{session.title}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {session.totalMin > 0 ? `${session.totalMin} min` : "—"}
                    </span>
                  </div>
                  {session.drills.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin ejercicios asignados.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {session.drills.map((d, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-1 bg-muted/50 rounded px-2 py-0.5 text-xs"
                        >
                          <Dumbbell className="h-2.5 w-2.5 text-muted-foreground" />
                          <span>{d.title}</span>
                          {d.duration_minutes && (
                            <span className="text-muted-foreground">{d.duration_minutes}&#39;</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4 mr-1.5" />
                Atrás
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={createMut.isPending || preview.length === 0}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {createMut.isPending
                  ? "Creando..."
                  : `Confirmar y crear ${preview.length} entrenamientos`}
                <Check className="h-4 w-4 ml-1.5" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
