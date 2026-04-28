"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarRange, Plus, ChevronRight } from "lucide-react";
import {
  getSeasons,
  createSeason,
  updateSeasonStatus,
} from "@basketball-clipper/shared/api";
import type { Season, SeasonCreate, SeasonStatus } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

// ── helpers ────────────────────────────────────────────────────────────────────

type StatusMeta = { label: string; variant: "default" | "secondary" | "outline" | "destructive" };

const STATUS_META: Record<SeasonStatus, StatusMeta> = {
  future: { label: "Futura", variant: "secondary" },
  active: { label: "Activa", variant: "default" },
  archived: { label: "Archivada", variant: "outline" },
};

/** Transiciones de estado permitidas desde la UI */
const NEXT_STATUS: Partial<Record<SeasonStatus, { status: SeasonStatus; label: string; destructive?: boolean }[]>> = {
  future: [
    { status: "active", label: "Activar" },
    { status: "archived", label: "Archivar", destructive: true },
  ],
  active: [
    { status: "archived", label: "Archivar", destructive: true },
  ],
};

const EMPTY_FORM: SeasonCreate = { name: "", starts_at: undefined, ends_at: undefined };

// ── component ─────────────────────────────────────────────────────────────────

export default function SeasonsPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdStr } = use(params);
  const clubId = Number(clubIdStr);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const isTD = activeProfile?.role === "technical_director";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<SeasonCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  // Queries
  const { data: seasons = [], isLoading } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId),
    enabled: !!token,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data: SeasonCreate) => createSeason(token!, clubId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seasons", clubId] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const statusMutation = useMutation({
    mutationFn: ({ seasonId, status }: { seasonId: number; status: SeasonStatus }) =>
      updateSeasonStatus(token!, clubId, seasonId, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["seasons", clubId] }),
  });

  function openCreate() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.name.trim()) {
      setFormError("El nombre es obligatorio");
      return;
    }
    createMutation.mutate(form);
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Temporadas</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {seasons.length} temporada{seasons.length !== 1 ? "s" : ""} en el club
            </p>
          </div>
          {isTD && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nueva temporada
            </Button>
          )}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : seasons.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <CalendarRange className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p>No hay temporadas creadas todavía.</p>
            {isTD && (
              <Button variant="link" onClick={openCreate}>
                Crea la primera temporada
              </Button>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {seasons.map((s) => (
              <SeasonRow
                key={s.id}
                season={s}
                isTD={isTD}
                isPending={statusMutation.isPending && statusMutation.variables?.seasonId === s.id}
                onStatusChange={(status) =>
                  statusMutation.mutate({ seasonId: s.id, status })
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Dialog crear temporada */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) { setForm(EMPTY_FORM); setFormError(null); }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nueva temporada</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="season-name">Nombre *</Label>
              <Input
                id="season-name"
                placeholder="2025-2026"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="starts-at">Fecha inicio</Label>
                <Input
                  id="starts-at"
                  type="date"
                  value={form.starts_at ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, starts_at: e.target.value || undefined }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ends-at">Fecha fin</Label>
                <Input
                  id="ends-at"
                  type="date"
                  value={form.ends_at ?? ""}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, ends_at: e.target.value || undefined }))
                  }
                />
              </div>
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
            <Button onClick={handleSubmit} disabled={createMutation.isPending || !form.name.trim()}>
              {createMutation.isPending ? "Creando..." : "Crear temporada"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── SeasonRow ─────────────────────────────────────────────────────────────────

function SeasonRow({
  season,
  isTD,
  isPending,
  onStatusChange,
}: {
  season: Season;
  isTD: boolean;
  isPending: boolean;
  onStatusChange: (status: SeasonStatus) => void;
}) {
  const meta = STATUS_META[season.status];
  const transitions = NEXT_STATUS[season.status] ?? [];

  function formatDate(d: string | null) {
    if (!d) return null;
    return new Date(d).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }

  const startStr = formatDate(season.starts_at);
  const endStr = formatDate(season.ends_at);

  return (
    <div className="flex items-center gap-4 px-4 py-4">
      <CalendarRange className="h-5 w-5 text-muted-foreground shrink-0" />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{season.name}</p>
          <Badge variant={meta.variant}>{meta.label}</Badge>
        </div>
        {(startStr || endStr) && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {startStr && endStr ? (
              <>{startStr} <ChevronRight className="inline h-3 w-3" /> {endStr}</>
            ) : startStr ? (
              <>Desde {startStr}</>
            ) : (
              <>Hasta {endStr}</>
            )}
          </p>
        )}
      </div>

      {isTD && transitions.length > 0 && (
        <div className="flex gap-1.5 shrink-0">
          {transitions.map((t) =>
            t.destructive ? (
              <AlertDialog key={t.status}>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={isPending} aria-label={`${t.label} temporada ${season.name}`}>
                    {t.label}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>¿Archivar temporada?</AlertDialogTitle>
                    <AlertDialogDescription>
                      La temporada <strong>{season.name}</strong> pasará al estado archivado.
                      Esta acción no se puede deshacer fácilmente.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={() => onStatusChange(t.status)}>
                      Archivar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button
                key={t.status}
                variant="outline"
                size="sm"
                disabled={isPending}
                onClick={() => onStatusChange(t.status)}
                aria-label={`${t.label} temporada ${season.name}`}
              >
                {isPending ? "..." : t.label}
              </Button>
            )
          )}
        </div>
      )}
    </div>
  );
}
