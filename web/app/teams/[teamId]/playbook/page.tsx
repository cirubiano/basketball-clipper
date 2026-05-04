"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
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
import { Plus, Trash2, Lock, Pencil, ChevronLeft, ChevronRight, GitBranch, MessageSquare, BookMarked } from "lucide-react";
import Link from "next/link";
import {
  listPlaybook,
  addToPlaybook,
  removeFromPlaybook,
  updatePlaybookNote,
  listDrills,
  getDrill,
} from "@basketball-clipper/shared/api";
import type { PlaybookEntry, Drill, SequenceNode, CourtLayoutType, SketchElement } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";
import { CourtBackground } from "@/components/drill-editor/CourtBackground";
import { ElementRenderer } from "@/components/drill-editor/ElementRenderer";
import { COURT_SIZE, toSvg } from "@/components/drill-editor/court-utils";

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

  // Node viewer state
  const [viewDrillId, setViewDrillId] = useState<number | null>(null);
  const [nodeStack, setNodeStack] = useState<SequenceNode[]>([]);

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

  // Fetch full drill details for thumbnails and viewer
  const playbookEntries = entries.filter((e) => e.drill.type === "play");
  const drillIds = playbookEntries.map((e) => e.drill.id);

  const drillDetailQueries = useQueries({
    queries: drillIds.map((id) => ({
      queryKey: ["drill", id],
      queryFn: () => getDrill(token!, id),
      enabled: !!token,
    })),
  });

  const drillDetailMap = new Map<number, Drill>(
    drillDetailQueries.filter((q) => q.data).map((q) => [q.data!.id, q.data!])
  );

  // Filter: playbook only shows type=play
  const playbookDrillIds = new Set(playbookEntries.map((e) => e.drill.id));
  // Add dialog: only type=play not already in playbook
  const availableDrills = myDrills.filter(
    (d) => !playbookDrillIds.has(d.id) && d.type === "play",
  );

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

  // Node viewer helpers
  const viewDrill = viewDrillId ? drillDetailMap.get(viewDrillId) : null;
  const currentNode: SequenceNode | null =
    nodeStack.length > 0
      ? nodeStack[nodeStack.length - 1]
      : viewDrill?.root_sequence ?? null;

  function openViewer(drillId: number) {
    setViewDrillId(drillId);
    setNodeStack([]);
  }

  function closeViewer() {
    setViewDrillId(null);
    setNodeStack([]);
  }

  function goToNode(node: SequenceNode) {
    setNodeStack((prev) => [...prev, node]);
  }

  function goBack() {
    setNodeStack((prev) => prev.slice(0, -1));
  }

  const canGoBack = nodeStack.length > 0;
  const branches = currentNode?.branches ?? [];

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Playbook del equipo</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Jugadas asignadas a este equipo
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
        ) : playbookEntries.length === 0 ? (
          <div className="border rounded-lg border-dashed p-14 text-center text-muted-foreground">
            <BookMarked className="h-9 w-9 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">El playbook del equipo está vacío</p>
            <p className="text-xs mb-4 max-w-xs mx-auto">
              Añade jugadas desde tu biblioteca personal para compartirlas con todo el equipo.
              Puedes adjuntar notas tácticas a cada una.
            </p>
            <div className="flex items-center justify-center gap-2">
              {clubId && (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Añadir jugada
                </Button>
              )}
              <Button size="sm" variant="outline" asChild>
                <Link href="/drills">Ir a Mi biblioteca</Link>
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {playbookEntries.map((entry) => (
              <PlaybookEntryRow
                key={entry.id}
                entry={entry}
                currentUserId={user?.id}
                drillDetail={drillDetailMap.get(entry.drill.id)}
                clubId={clubId!}
                teamId={teamId}
                token={token!}
                onEdit={() => router.push(`/drills/${entry.drill.id}/edit`)}
                onView={() => openViewer(entry.drill.id)}
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
            <DialogTitle>Añadir jugada al playbook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Jugada de mi biblioteca</p>
              {availableDrills.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No tienes jugadas disponibles para añadir.
                </p>
              ) : (
                <Select
                  value={selectedDrillId?.toString() ?? ""}
                  onValueChange={(v) => setSelectedDrillId(Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona una jugada..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrills.map((d) => (
                      <SelectItem key={d.id} value={d.id.toString()}>
                        {d.name}
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

      {/* Node viewer dialog */}
      <Dialog open={viewDrillId !== null} onOpenChange={(open) => { if (!open) closeViewer(); }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{viewDrill?.name ?? "Cargando..."}</DialogTitle>
          </DialogHeader>

          {currentNode ? (
            <div className="space-y-3">
              {/* Node label */}
              {(currentNode.label || nodeStack.length > 0) && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {nodeStack.length === 0 ? (
                    <span className="font-medium text-foreground">Posición inicial</span>
                  ) : (
                    <>
                      <span>Posición inicial</span>
                      {nodeStack.map((n, i) => (
                        <span key={n.id} className="flex items-center gap-2">
                          <ChevronRight className="h-3 w-3" />
                          <span className={i === nodeStack.length - 1 ? "font-medium text-foreground" : ""}>
                            {n.label ?? `Nodo ${i + 1}`}
                          </span>
                        </span>
                      ))}
                    </>
                  )}
                </div>
              )}

              {/* Canvas */}
              <FullCanvas layout={viewDrill!.court_layout} node={currentNode} />

              {/* Navigation */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canGoBack}
                  onClick={goBack}
                  className="gap-1"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </Button>

                <div className="flex gap-2">
                  {branches.length === 0 && nodeStack.length > 0 && (
                    <span className="text-xs text-muted-foreground self-center">Fin de la jugada</span>
                  )}
                  {branches.length === 1 && (
                    <Button
                      size="sm"
                      onClick={() => goToNode(branches[0])}
                      className="gap-1"
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  )}
                  {branches.length > 1 && (
                    <div className="flex gap-1 items-center">
                      <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                      {branches.map((branch, i) => (
                        <Button
                          key={branch.id}
                          size="sm"
                          variant="outline"
                          onClick={() => goToNode(branch)}
                          className="text-xs"
                        >
                          {branch.label ?? `Opción ${i + 1}`}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
              Cargando jugada...
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── FullCanvas — large read-only canvas for the viewer ────────────────────────

function FullCanvas({ layout, node }: { layout: CourtLayoutType; node: SequenceNode }) {
  const { w, h } = COURT_SIZE[layout];
  return (
    <div className="bg-zinc-800 rounded flex items-center justify-center p-3">
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="max-w-full rounded"
        style={{ maxHeight: "55vh", aspectRatio: `${w}/${h}` }}
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

// ── DrillThumbnail — small preview for list cards ─────────────────────────────

function DrillThumbnail({ layout, node }: { layout: CourtLayoutType; node: SequenceNode }) {
  const { w, h } = COURT_SIZE[layout];
  return (
    <div className="w-24 h-[68px] rounded border border-muted overflow-hidden bg-zinc-800 shrink-0">
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

// ── PlaybookEntryRow ──────────────────────────────────────────────────────────

function PlaybookEntryRow({
  entry,
  currentUserId,
  drillDetail,
  clubId,
  teamId,
  token,
  onEdit,
  onView,
  onRemove,
  isRemoving,
}: {
  entry: PlaybookEntry;
  currentUserId: number | undefined;
  drillDetail: Drill | undefined;
  clubId: number;
  teamId: number;
  token: string;
  onEdit: () => void;
  onView: () => void;
  onRemove: () => void;
  isRemoving: boolean;
}) {
  const drill = entry.drill;
  const isAuthor = entry.added_by === currentUserId;
  const qc = useQueryClient();

  // Inline note editing
  const [editingNote, setEditingNote] = useState(false);
  const [noteText, setNoteText] = useState(entry.note ?? "");

  const noteMut = useMutation({
    mutationFn: (note: string | null) =>
      updatePlaybookNote(token, clubId, teamId, entry.id, { note }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["playbook"] });
      setEditingNote(false);
    },
    onError: () => {
      setNoteText(entry.note ?? "");
      setEditingNote(false);
    },
  });

  function commitNote() {
    const trimmed = noteText.trim() || null;
    if (trimmed === (entry.note ?? null)) {
      setEditingNote(false);
      return;
    }
    noteMut.mutate(trimmed);
  }

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card">
      {/* Thumbnail */}
      {drillDetail ? (
        <DrillThumbnail layout={drillDetail.court_layout} node={drillDetail.root_sequence} />
      ) : (
        <div className="w-24 h-[68px] rounded border border-muted bg-muted/30 shrink-0 animate-pulse" />
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-medium truncate">{drill.name}</span>
          {entry.is_frozen && (
            <span
              className="flex items-center gap-0.5 text-xs text-muted-foreground shrink-0"
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

        {/* Inline note */}
        {editingNote ? (
          <textarea
            autoFocus
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onBlur={commitNote}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitNote(); }
              if (e.key === "Escape") { setNoteText(entry.note ?? ""); setEditingNote(false); }
            }}
            placeholder="Escribe una nota táctica..."
            rows={2}
            disabled={noteMut.isPending}
            className="mt-1 w-full text-xs rounded border border-border bg-background px-2 py-1.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none disabled:opacity-50"
          />
        ) : (
          <button
            onClick={() => { setNoteText(entry.note ?? ""); setEditingNote(true); }}
            className="mt-1 flex items-start gap-1 text-xs text-left w-full group/note"
            title="Editar nota"
          >
            <MessageSquare className="h-3 w-3 mt-0.5 shrink-0 text-muted-foreground/60 group-hover/note:text-primary transition-colors" />
            {entry.note ? (
              <span className="text-muted-foreground group-hover/note:text-foreground transition-colors line-clamp-2">
                {entry.note}
              </span>
            ) : (
              <span className="text-muted-foreground/40 group-hover/note:text-muted-foreground transition-colors italic">
                Añadir nota...
              </span>
            )}
          </button>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-1 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="text-xs gap-1"
          onClick={onView}
          title="Ver jugada nodo a nodo"
        >
          Ver
        </Button>
        {isAuthor && !entry.is_frozen && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onEdit}
            title="Editar jugada"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        )}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
              disabled={isRemoving}
              title="Quitar del playbook"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Quitar del playbook?</AlertDialogTitle>
              <AlertDialogDescription>
                Se quitará <strong>{drill.name}</strong> del playbook del equipo.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={onRemove}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Quitar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
