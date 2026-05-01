"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Plus, Trash2, Lock, ExternalLink } from "lucide-react";
import Link from "next/link";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import {
  listPlaybook,
  addToPlaybook,
  removeFromPlaybook,
  listDrills,
} from "@basketball-clipper/shared/api";
import type { PlaybookEntry } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";

export default function PlaybookPage({
  params,
}: {
  params: { teamId: string };
}) {
  const { teamId: teamIdStr } = params;
  const teamId = Number(teamIdStr);
  const { token, activeProfile, user } = useAuth();
  const clubId = activeProfile?.club_id;
  const qc = useQueryClient();
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["playbook", clubId, teamId],
    queryFn: () => listPlaybook(token!, clubId!, teamId),
    enabled: !!token && !!clubId,
  });

  const { data: myDrills = [] } = useQuery({
    queryKey: ["drills", "all"],
    queryFn: () => listDrills(token!),
    enabled: !!token && addOpen,
  });

  // Filter out drills already in the playbook
  const playbookDrillIds = new Set(entries.map((e) => e.drill.id));
  const availableDrills = myDrills.filter((d) => !playbookDrillIds.has(d.id));

  const addMut = useMutation({
    mutationFn: () =>
      addToPlaybook(token!, clubId!, teamId, { drill_id: selectedDrillId! }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["playbook", clubId, teamId] });
      setAddOpen(false);
      setSelectedDrillId(null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (entryId: number) => removeFromPlaybook(token!, clubId!, teamId, entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["playbook", clubId, teamId] }),
  });

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <Breadcrumb items={[
          { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
          { label: activeProfile?.team_name ?? "Equipo", href: `/teams/${teamId}/matches` },
          { label: "Playbook" },
        ]} />
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Playbook del equipo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Jugadas y ejercicios asignados a este equipo
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="gap-2" disabled={!clubId}>
            <Plus className="h-4 w-4" />
            Añadir
          </Button>
        </div>

        {!clubId && (
          <Alert>
            <AlertDescription>
              Selecciona un perfil activo para gestionar el playbook.
            </AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Cargando playbook...</p>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-3">Este equipo no tiene jugadas ni ejercicios asignados.</p>
            <Button variant="outline" onClick={() => setAddOpen(true)} disabled={!clubId}>
              Añadir el primero
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <PlaybookEntryRow
                key={entry.id}
                entry={entry}
                currentUserId={user?.id}
                onEdit={() => router.push(`/drills/${entry.drill.id}/edit`)}
                onRemove={() => removeMut.mutate(entry.id)}
                isRemoving={removeMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add to playbook dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir al playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ejercicio o jugada de mi biblioteca</p>
              {availableDrills.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes elementos en tu biblioteca disponibles para añadir.
                </p>
              ) : (
                <Select
                  value={selectedDrillId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedDrillId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un elemento..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrills.map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.name}{" "}
                        <span className="text-muted-foreground text-xs ml-1">
                          ({d.type === "play" ? "Jugada" : "Ejercicio"})
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => addMut.mutate()}
              disabled={!selectedDrillId || addMut.isPending || availableDrills.length === 0}
            >
              {addMut.isPending ? "Añadiendo..." : "Añadir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function PlaybookEntryRow({
  entry,
  currentUserId,
  onEdit,
  onRemove,
  isRemoving,
}: {
  entry: PlaybookEntry;
  currentUserId: number | undefined;
  onEdit: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const drill = entry.drill;
  const isAuthor = entry.added_by === currentUserId;

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors group">
      <div
        className={isAuthor && !entry.is_frozen ? "cursor-pointer flex-1 min-w-0" : "flex-1 min-w-0"}
        onClick={isAuthor && !entry.is_frozen ? onEdit : undefined}
        role={isAuthor && !entry.is_frozen ? "button" : undefined}
      >
        <div className="flex items-center gap-2 mb-0.5">
          <Badge
            variant={drill.type === "play" ? "default" : "secondary"}
            className="text-xs"
          >
            {drill.type === "play" ? "Jugada" : "Ejercicio"}
          </Badge>
          <span className="text-sm font-medium truncate">{drill.name}</span>
          {entry.is_frozen && (
            <span
              className="flex items-center gap-0.5 text-xs text-muted-foreground"
              title="Copia congelada — el autor ya no pertenece al equipo"
            >
              <Lock className="h-3 w-3" />
              congelado
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {COURT_LAYOUT_LABELS[drill.court_layout]} ·{" "}
          {new Date(entry.created_at).toLocaleDateString("es-ES")}
          {drill.tags.length > 0 && (
            <> · {drill.tags.map((t) => t.name).join(", ")}</>
          )}
        </p>
      </div>

      <div className="flex gap-1">
        <Link href={`/drills/${drill.id}/edit`}>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground" title="Ver drill">
            <ExternalLink className="h-4 w-4" />
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={onRemove}
          disabled={isRemoving}
          title="Quitar del playbook"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
