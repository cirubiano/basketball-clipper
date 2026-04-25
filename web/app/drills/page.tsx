"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Archive, Copy, ChevronRight } from "lucide-react";
import { listDrills, createDrill, archiveDrill, cloneDrill } from "@basketball-clipper/shared";
import type { DrillSummary, DrillType, CourtLayoutType } from "@basketball-clipper/shared";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared";
import { cn } from "@/lib/utils";

const TYPE_TABS: { value: DrillType | "all"; label: string }[] = [
  { value: "all",   label: "Todo" },
  { value: "drill", label: "Ejercicios" },
  { value: "play",  label: "Jugadas" },
];

export default function DrillsPage() {
  const { token } = useAuth();
  const router    = useRouter();
  const qc        = useQueryClient();

  const [tab,        setTab]        = useState<DrillType | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [form,       setForm]       = useState<{ type: DrillType; name: string; court_layout: CourtLayoutType }>({
    type: "drill", name: "", court_layout: "half_fiba",
  });

  const { data: drills = [], isLoading } = useQuery({
    queryKey: ["drills", tab],
    queryFn: () =>
      listDrills(token!, { type: tab === "all" ? undefined : tab }),
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

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">

        {/* Cabecera */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Mi biblioteca</h1>
          <Button onClick={() => setCreateOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Nuevo
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 border-b border-border">
          {TYPE_TABS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTab(value)}
              className={cn(
                "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
                tab === value
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Lista */}
        {isLoading ? (
          <p className="text-muted-foreground text-sm">Cargando...</p>
        ) : drills.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-3">No tienes {tab === "play" ? "jugadas" : tab === "drill" ? "ejercicios" : "elementos"} aún.</p>
            <Button variant="outline" onClick={() => setCreateOpen(true)}>
              Crear el primero
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {drills.map((drill) => (
              <DrillRow
                key={drill.id}
                drill={drill}
                onEdit={() => router.push(`/drills/${drill.id}/edit`)}
                onClone={() => cloneMut.mutate(drill.id)}
                onArchive={() => archiveMut.mutate(drill.id)}
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
                        : "border-border text-muted-foreground hover:border-foreground"
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

function DrillRow({
  drill,
  onEdit,
  onClone,
  onArchive,
}: {
  drill: DrillSummary;
  onEdit: () => void;
  onClone: () => void;
  onArchive: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors group">
      <div className="cursor-pointer flex-1 min-w-0" onClick={onEdit} role="button">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge variant={drill.type === "play" ? "default" : "secondary"} className="text-xs">
            {drill.type === "play" ? "Jugada" : "Ejercicio"}
          </Badge>
          <span className="text-sm font-medium truncate">{drill.name}</span>
          {drill.parent_id && (
            <Badge variant="outline" className="text-xs">variante</Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {COURT_LAYOUT_LABELS[drill.court_layout]} ·{" "}
          {new Date(drill.updated_at).toLocaleDateString("es-ES")}
          {drill.tags.length > 0 && (
            <> · {drill.tags.map((t) => t.name).join(", ")}</>
          )}
        </p>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClone} title="Clonar">
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onArchive} title="Archivar">
          <Archive className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} title="Editar">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
