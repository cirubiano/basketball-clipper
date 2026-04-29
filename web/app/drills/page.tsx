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
import { Plus, Archive, Copy, ChevronRight, BookOpen, Pencil } from "lucide-react";
import { listDrills, createDrill, archiveDrill, cloneDrill } from "@basketball-clipper/shared/api";
import type { DrillSummary, DrillType, CourtLayoutType } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";
import { cn } from "@/lib/utils";

// ── Court preview SVG ─────────────────────────────────────────────────────────

function CourtSVG({ layout }: { layout: CourtLayoutType }) {
  const isFull = layout === "full_fiba" || layout === "mini_fiba";

  if (isFull) {
    return (
      <svg viewBox="0 0 130 70" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
        {/* Border */}
        <rect x="1" y="1" width="128" height="68" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
        {/* Center line */}
        <line x1="65" y1="1" x2="65" y2="69" stroke="currentColor" strokeWidth="1"/>
        {/* Center circle */}
        <circle cx="65" cy="35" r="9" fill="none" stroke="currentColor" strokeWidth="1"/>
        {/* Left paint */}
        <rect x="1" y="24" width="19" height="22" fill="none" stroke="currentColor" strokeWidth="1"/>
        {/* Left arc */}
        <path d="M 20,24 A 13,13 0 0,1 20,46" fill="none" stroke="currentColor" strokeWidth="1"/>
        {/* Left 3pt */}
        <path d="M 1,10 A 38,38 0 0,1 1,60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
        {/* Right paint */}
        <rect x="110" y="24" width="19" height="22" fill="none" stroke="currentColor" strokeWidth="1"/>
        {/* Right arc */}
        <path d="M 110,24 A 13,13 0 0,0 110,46" fill="none" stroke="currentColor" strokeWidth="1"/>
        {/* Right 3pt */}
        <path d="M 129,10 A 38,38 0 0,0 129,60" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
      </svg>
    );
  }

  // half court (half_fiba | half_mini_fiba)
  return (
    <svg viewBox="0 0 120 80" className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
      {/* Border */}
      <rect x="1" y="1" width="118" height="78" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      {/* Paint */}
      <rect x="42" y="1" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="1"/>
      {/* Basket arc */}
      <path d="M 42,37 A 18,18 0 0,0 78,37" fill="none" stroke="currentColor" strokeWidth="1"/>
      {/* 3pt line */}
      <path d="M 6,79 A 70,70 0 0,1 114,79" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="2,2"/>
      {/* Basket */}
      <circle cx="60" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TYPE_TABS: { value: DrillType | "all"; label: string }[] = [
  { value: "all",   label: "Todo" },
  { value: "drill", label: "Ejercicios" },
  { value: "play",  label: "Jugadas" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DrillsPage() {
  const { token } = useAuth();
  const router    = useRouter();
  const qc        = useQueryClient();

  const [tab,        setTab]        = useState<DrillType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ type: DrillType; name: string; court_layout: CourtLayoutType }>({
    type: "drill", name: "", court_layout: "half_fiba",
  });

  const { data: drills = [], isLoading } = useQuery({
    queryKey: ["drills", tab],
    queryFn: () => listDrills(token!, { type: tab === "all" ? undefined : tab }),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: () => createDrill(token!, form),
    onSuccess: (drill) => {
      qc.invalidateQueries({ queryKey: ["drills"] });
      setCreateOpen(false);
      router.push(`/drills/${drill.id}/edit`);
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveDrill(token!, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["drills"] }),
  });

  const cloneMut = useMutation({
    mutationFn: (id: number) => cloneDrill(token!, id),
    onSuccess: (drill) => {
      qc.invalidateQueries({ queryKey: ["drills"] });
      router.push(`/drills/${drill.id}/edit`);
    },
  });

  const active = drills.filter((d) => !d.archived_at);

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-5xl">

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Mi biblioteca</h1>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
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

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-lg" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-14 text-center text-muted-foreground">
            <BookOpen className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">
              {tab === "play" ? "No tienes jugadas aún" : tab === "drill" ? "No tienes ejercicios aún" : "Tu biblioteca está vacía"}
            </p>
            <p className="text-xs mb-4">
              {tab === "play"
                ? "Las jugadas te permiten diagramar estrategias de ataque y defensa con canvas interactivo."
                : tab === "drill"
                ? "Los ejercicios te permiten diseñar entrenamientos con movimientos y elementos de cancha."
                : "Crea ejercicios y jugadas para compartirlos con tu equipo o publicarlos en el catálogo del club."}
            </p>
            <Button onClick={() => setCreateOpen(true)}>Crear el primero</Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((drill) => (
              <DrillCard
                key={drill.id}
                drill={drill}
                onEdit={() => router.push(`/drills/${drill.id}/edit`)}
                onClone={() => cloneMut.mutate(drill.id)}
                onArchive={() => archiveMut.mutate(drill.id)}
                isCloningThis={cloneMut.isPending && cloneMut.variables === drill.id}
              />
            ))}
          </div>
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

// ── DrillCard ─────────────────────────────────────────────────────────────────

function DrillCard({
  drill,
  onEdit,
  onClone,
  onArchive,
  isCloningThis,
}: {
  drill: DrillSummary;
  onEdit: () => void;
  onClone: () => void;
  onArchive: () => void;
  isCloningThis: boolean;
}) {
  const isPlay = drill.type === "play";

  return (
    <div className="group flex flex-col rounded-lg border border-border bg-card hover:border-primary/40 transition-colors overflow-hidden">

      {/* Court preview — clicable */}
      <button
        onClick={onEdit}
        className="block p-4 pb-3 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={`Editar ${drill.name}`}
      >
        <div className={cn(
          "rounded-md flex items-center justify-center p-3",
          isPlay ? "bg-blue-50" : "bg-amber-50",
          "aspect-[3/2]",
        )}>
          <CourtSVG layout={drill.court_layout} />
        </div>
      </button>

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
      </div>
    </div>
  );
}
