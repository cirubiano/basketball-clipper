"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { PaginationBar } from "@/components/ui/pagination-bar";
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
import { Plus, Archive, Copy, BookOpen, Pencil, BookMarked, Heart, LayoutGrid, List } from "lucide-react";
import {
  listDrills,
  createDrill,
  archiveDrill,
  cloneDrill,
  setDrillFavorite,
  listCatalog,
  publishToCatalog,
} from "@basketball-clipper/shared/api";
import type { DrillSummary, DrillType, CourtLayoutType } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";
import { useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { CourtSVG } from "@/components/ui/court-svg";

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TYPE_TABS: { value: DrillType | "all" | "favorites"; label: string }[] = [
  { value: "all",       label: "Todo" },
  { value: "drill",     label: "Ejercicios" },
  { value: "play",      label: "Jugadas" },
  { value: "favorites", label: "Favoritos" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DrillsPage() {
  const { token, activeProfile } = useAuth();
  const router    = useRouter();
  const qc        = useQueryClient();
  const { toast } = useToast();

  const clubId = activeProfile?.club_id ?? null;

  const [tab,        setTab]        = useState<DrillType | "all" | "favorites">("all");
  // #33 -- toggle entre vista de cuadricula (por defecto) y lista
  const [viewMode,   setViewMode]   = useState<"grid" | "list">("grid");
  const [page,       setPage]        = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ type: DrillType; name: string; court_layout: CourtLayoutType }>({
    type: "drill", name: "", court_layout: "half_fiba",
  });

  const { data: drills = [], isLoading } = useQuery({
    queryKey: ["drills", tab],
    queryFn: () =>
      listDrills(token!, {
        type: tab === "all" || tab === "favorites" ? undefined : tab,
      }),
    enabled: !!token,
  });

  // Load catalog to know which drills are already published
  const { data: catalogEntries = [] } = useQuery({
    queryKey: ["catalog", clubId],
    queryFn: () => listCatalog(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  // Set of original drill IDs already in the catalog
  const publishedDrillIds = new Set(
    catalogEntries
      .filter((e) => !e.archived_at && e.original_drill_id !== null)
      .map((e) => e.original_drill_id as number)
  );

  const createMut = useMutation({
    mutationFn: () => createDrill(token!, form),
    onSuccess: (drill) => {
      void qc.invalidateQueries({ queryKey: ["drills"] });
      setCreateOpen(false);
      router.push(`/drills/${drill.id}/edit`);
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveDrill(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["drills"] });
      toast("Drill archivado.");
    },
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => cloneDrill(token!, id),
    onSuccess: (drill) => {
      void qc.invalidateQueries({ queryKey: ["drills"] });
      router.push(`/drills/${drill.id}/edit`);
    },
  });

  const favoriteMut = useMutation({
    mutationFn: ({ id, isFavorite }: { id: number; isFavorite: boolean }) =>
      setDrillFavorite(token!, id, isFavorite),
    // #49 — optimistic update: flip is_favorite instantly, roll back on error
    onMutate: async ({ id, isFavorite }) => {
      await qc.cancelQueries({ queryKey: ["drills"] });
      const snapshot = qc.getQueriesData<DrillSummary[]>({ queryKey: ["drills"] });
      qc.setQueriesData<DrillSummary[]>({ queryKey: ["drills"] }, (old) =>
        old?.map((d) => d.id === id ? { ...d, is_favorite: isFavorite } : d),
      );
      return { snapshot };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) {
        ctx.snapshot.forEach(([key, data]) => qc.setQueryData(key, data));
      }
      toast("No se pudo actualizar el favorito.", "error");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["drills"] }),
  });

  const publishMut = useMutation({
    mutationFn: (drillId: number) => publishToCatalog(token!, clubId!, { drill_id: drillId }),
    onSuccess: (_, drillId) => {
      void qc.invalidateQueries({ queryKey: ["catalog", clubId] });
      toast("Publicado en el catálogo del club.");
      // Optimistically mark as published
      publishedDrillIds.add(drillId);
    },
    onError: () => toast("No se pudo publicar en el catálogo.", "error"),
  });

  const active = drills
    .filter((d) => !d.archived_at)
    .filter((d) => (tab === "favorites" ? d.is_favorite : true));

  // #48 — paginación: 12 en grid (3×4), 20 en lista
  const PAGE_SIZE_D = viewMode === "grid" ? 12 : 20;
  const totalPagesD = Math.max(1, Math.ceil(active.length / PAGE_SIZE_D));
  const safePageD = Math.min(page, totalPagesD);
  const activePage = active.slice((safePageD - 1) * PAGE_SIZE_D, safePageD * PAGE_SIZE_D);

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <Breadcrumb items={[{ label: "Mi biblioteca" }]} />

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Mi biblioteca</h1>
          <div className="flex items-center gap-2">
            {/* #33 -- toggle vista cuadricula / lista */}
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setViewMode("grid")}
                className={cn(
                  "p-2 transition-colors",
                  viewMode === "grid"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                aria-label="Vista cuadricula"
                title="Vista cuadricula"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "p-2 transition-colors",
                  viewMode === "list"
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                aria-label="Vista lista"
                title="Vista lista"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
            <Button onClick={() => setCreateOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Nuevo
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border">
          {TYPE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Grid / Lista */}
        {isLoading ? (
          <div className={viewMode === "grid"
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "flex flex-col gap-2"
          }>
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className={viewMode === "grid" ? "h-64 rounded-lg" : "h-14 rounded-lg"} />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-14 text-center text-muted-foreground">
            {tab === "favorites"
              ? <Heart className="h-8 w-8 mx-auto mb-3 opacity-40" />
              : <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            }
            <p className="text-sm font-medium mb-1">
              {tab === "favorites"
                ? "No tienes favoritos aún"
                : tab === "play"
                ? "No tienes jugadas aún"
                : tab === "drill"
                ? "No tienes ejercicios aún"
                : "Tu biblioteca está vacía"}
            </p>
            <p className="text-xs mb-4">
              {tab === "favorites"
                ? "Pulsa el corazón en cualquier ejercicio o jugada para guardarlo aquí."
                : tab === "play"
                ? "Las jugadas te permiten diagramar estrategias de ataque y defensa con canvas interactivo."
                : tab === "drill"
                ? "Los ejercicios te permiten diseñar entrenamientos con movimientos y elementos de cancha."
                : "Crea ejercicios y jugadas para compartirlos con tu equipo o publicarlos en el catálogo del club."}
            </p>
            {tab !== "favorites" && (
              <Button onClick={() => setCreateOpen(true)}>Crear el primero</Button>
            )}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activePage.map((drill) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                onEdit={() => router.push(`/drills/${drill.id}/edit`)}
                onClone={() => cloneMut.mutate(drill.id)}
                onArchive={() => archiveMut.mutate(drill.id)}
                onPublish={clubId ? () => publishMut.mutate(drill.id) : undefined}
                isCloningThis={cloneMut.isPending && cloneMut.variables === drill.id}
                isPublishingThis={publishMut.isPending && publishMut.variables === drill.id}
                onFavoriteToggle={() =>
                  favoriteMut.mutate({ id: drill.id, isFavorite: !drill.is_favorite })
                }
                isPublished={publishedDrillIds.has(drill.id)}
              />
            ))}
          </div>
        ) : (
          /* #33 -- vista lista: filas compactas */
          <div className="flex flex-col divide-y divide-border rounded-lg border border-border overflow-hidden">
            {activePage.map((drill) => (
              <DrillRow
                key={drill.id}
                drill={drill}
                onEdit={() => router.push(`/drills/${drill.id}/edit`)}
                onClone={() => cloneMut.mutate(drill.id)}
                onArchive={() => archiveMut.mutate(drill.id)}
                onFavoriteToggle={() =>
                  favoriteMut.mutate({ id: drill.id, isFavorite: !drill.is_favorite })
                }
                isCloningThis={cloneMut.isPending && cloneMut.variables === drill.id}
                isPublished={publishedDrillIds.has(drill.id)}
              />
            ))}
          </div>
        )}
        {active.length > PAGE_SIZE_D && (
          <PaginationBar page={safePageD} totalPages={totalPagesD} onPage={setPage} />
        )}
      </div>

      {/* Dialog nuevo drill */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo elemento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <div className="flex gap-2">
                {(["drill", "play"] as DrillType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setForm({ ...form, type: t })}
                    className={cn(
                      "flex-1 py-2 text-sm rounded-md border transition-colors",
                      form.type === t
                        ? "border-primary bg-primary/10 text-primary font-medium"
                        : "border-border text-muted-foreground hover:border-foreground",
                    )}
                  >
                    {t === "drill" ? "Ejercicio" : "Jugada"}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                placeholder={form.type === "drill" ? "Ej: 5v0 transición..." : "Ej: Pick & Roll básico..."}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && form.name.trim() && createMut.mutate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cancha</Label>
              <Select
                value={form.court_layout}
                onValueChange={(v) => setForm({ ...form, court_layout: v as CourtLayoutType })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.entries(COURT_LAYOUT_LABELS) as [CourtLayoutType, string][]).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={!form.name.trim() || createMut.isPending}
            >
              {createMut.isPending ? "Creando..." : "Crear y editar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── DrillRow -- vista lista compacta ─────────────────────────────────────────

function DrillRow({
  drill,
  onEdit,
  onClone,
  onArchive,
  onFavoriteToggle,
  isCloningThis,
  isPublished,
}: {
  drill: DrillSummary;
  onEdit: () => void;
  onClone: () => void;
  onArchive: () => void;
  onFavoriteToggle: () => void;
  isCloningThis: boolean;
  isPublished: boolean;
}) {
  const isPlay = drill.type === "play";

  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors">
      <div className={cn(
        "shrink-0 rounded-md flex items-center justify-center w-9 h-9 text-muted-foreground",
        isPlay ? "bg-blue-50" : "bg-amber-50",
      )}>
        <BookOpen className="h-4 w-4" />
      </div>
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium truncate">{drill.name}</p>
        <p className="text-xs text-muted-foreground">
          {isPlay ? "Jugada" : "Ejercicio"} · {COURT_LAYOUT_LABELS[drill.court_layout]} · {new Date(drill.updated_at).toLocaleDateString("es-ES")}
          {isPublished && <span className="ml-1.5 text-green-700">· En catálogo</span>}
        </p>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={(e) => { e.stopPropagation(); onFavoriteToggle(); }}
          className={cn(
            "p-1.5 rounded transition-colors",
            drill.is_favorite ? "text-red-500 hover:text-red-600" : "text-muted-foreground/40 hover:text-red-400",
          )}
          aria-label={drill.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
          title={drill.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <Heart className={cn("h-4 w-4", drill.is_favorite && "fill-current")} />
        </button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClone} disabled={isCloningThis} title="Clonar">
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Editar">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" title="Archivar">
              <Archive className="h-3.5 w-3.5" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Archivar este elemento?</AlertDialogTitle>
              <AlertDialogDescription>
                <strong>{drill.name}</strong> quedará archivado y no aparecerá en tu biblioteca.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={onArchive} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Archivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

// ── DrillCard ─────────────────────────────────────────────────────────────────

function DrillCard({
  drill,
  onEdit,
  onClone,
  onArchive,
  onPublish,
  onFavoriteToggle,
  isCloningThis,
  isPublishingThis,
  isPublished,
}: {
  drill: DrillSummary;
  onEdit: () => void;
  onClone: () => void;
  onArchive: () => void;
  onPublish?: () => void;
  onFavoriteToggle: () => void;
  isCloningThis: boolean;
  isPublishingThis: boolean;
  isPublished: boolean;
}) {
  const isPlay = drill.type === "play";

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/40 transition-colors overflow-hidden">

      {/* Court preview — clicable + favorite button */}
      <div className="relative">
        <button
          onClick={onEdit}
          className="block w-full p-4 pb-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label={`Editar ${drill.name}`}
        >
          <div className={cn(
            "rounded-md flex items-center justify-center p-3",
            isPlay ? "bg-blue-50" : "bg-amber-50",
            "aspect-[3/2]",
          )}>
            <CourtSVG layout={drill.court_layout} className="w-full h-full" />
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onFavoriteToggle(); }}
          className={cn(
            "absolute top-5 right-5 p-1 rounded-full transition-colors",
            drill.is_favorite
              ? "text-red-500 hover:text-red-600"
              : "text-muted-foreground/40 hover:text-red-400",
          )}
          aria-label={drill.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
          title={drill.is_favorite ? "Quitar de favoritos" : "Añadir a favoritos"}
        >
          <Heart className={cn("h-4 w-4", drill.is_favorite && "fill-current")} />
        </button>
      </div>

      {/* Content */}
      <div className="px-4 pb-4 flex flex-col flex-1">
        {/* Type badge + variant */}
        <div className="flex items-center gap-1.5 mb-1.5">
          <Badge
            variant={isPlay ? "default" : "secondary"}
            className="text-xs"
          >
            {isPlay ? "Jugada" : "Ejercicio"}
          </Badge>
          {drill.parent_id && (
            <Badge variant="outline" className="text-xs">variante</Badge>
          )}
          {!drill.parent_id && drill.variant_count > 0 && (
            <Badge variant="secondary" className="text-xs bg-muted text-muted-foreground">
              {drill.variant_count} {drill.variant_count === 1 ? "variante" : "variantes"}
            </Badge>
          )}
        </div>

        {/* Name */}
        <button
          onClick={onEdit}
          className="text-sm font-medium text-left hover:underline mb-1 line-clamp-2"
        >
          {drill.name}
        </button>

        {/* Description */}
        {drill.description && (
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
            {drill.description}
          </p>
        )}

        {/* Tags */}
        {drill.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {drill.tags.slice(0, 3).map((t) => (
              <span
                key={t.id}
                className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-muted text-muted-foreground"
              >
                {t.name}
              </span>
            ))}
            {drill.tags.length > 3 && (
              <span className="text-xs text-muted-foreground">+{drill.tags.length - 3}</span>
            )}
          </div>
        )}

        {/* Date */}
        <p className="text-xs text-muted-foreground mt-auto mb-3">
          {COURT_LAYOUT_LABELS[drill.court_layout]} ·{" "}
          {new Date(drill.updated_at).toLocaleDateString("es-ES")}
        </p>

        {/* Actions — siempre visibles */}
        <div className="flex items-center gap-1 pt-3 border-t border-border/50">
          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={onClone}
            disabled={isCloningThis}
            title="Clonar"
          >
            <Copy className="h-3.5 w-3.5" />
            {isCloningThis ? "Clonando…" : "Clonar"}
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                title="Archivar"
              >
                <Archive className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Archivar este elemento?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{drill.name}</strong> quedará archivado y no aparecerá
                  en tu biblioteca. Puedes recuperarlo más adelante.
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

          <Button
            variant="ghost"
            size="sm"
            className="flex-1 h-8 text-xs gap-1.5"
            onClick={onEdit}
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar
          </Button>
        </div>

        {/* Publicar al catálogo — solo si hay club activo */}
        {onPublish && (
          <div className="pt-2">
            {isPublished ? (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground justify-center py-1">
                <span className="text-green-700 font-medium">En catálogo del club</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-7 text-xs gap-1.5"
                onClick={onPublish}
                disabled={isPublishingThis}
                title="Publicar en el catálogo del club"
              >
                <BookMarked className="h-3.5 w-3.5" />
                {isPublishingThis ? "Publicando…" : "Publicar al catálogo"}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
