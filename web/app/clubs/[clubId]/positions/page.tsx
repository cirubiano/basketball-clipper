"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Archive } from "lucide-react";
import {
  listPositions,
  createPosition,
  updatePosition,
  archivePosition,
} from "@basketball-clipper/shared/api";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
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

interface PositionForm {
  name: string;
  color: string;
}

const EMPTY_FORM: PositionForm = { name: "", color: "#6366f1" };

export default function PositionsPage({
  params,
}: {
  params: { clubId: string };
}) {
  const clubId = Number(params.clubId);
  const { token, activeProfile } = useAuth();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PositionForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions", clubId],
    queryFn: () => listPositions(token!, clubId),
    enabled: !!token,
  });

  const saveMutation = useMutation({
    mutationFn: (data: PositionForm) => {
      if (editId !== null) return updatePosition(token!, clubId, editId, data);
      return createPosition(token!, clubId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positions", clubId] });
      closeDialog();
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (posId: number) => archivePosition(token!, clubId, posId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["positions", clubId] }),
  });

  function openCreate() {
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(pos: { id: number; name: string; color: string }) {
    setEditId(pos.id);
    setForm({ name: pos.name, color: pos.color });
    setFormError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Posiciones</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Posiciones dinámicas del club para clasificar jugadores
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva posición
          </Button>
        </div>

        {isLoading ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : positions.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <p className="font-medium mb-1">No hay posiciones definidas</p>
            <p className="text-sm mb-4">
              Crea posiciones personalizadas para clasificar los jugadores del club.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Crear primera posición
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {positions.map((pos) => (
              <div key={pos.id} className="flex items-center gap-3 px-4 py-3">
                {/* Color swatch */}
                <div
                  className="h-6 w-6 rounded-full shrink-0"
                  style={{ backgroundColor: pos.color }}
                />
                {/* Badge preview */}
                <span
                  className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium text-white"
                  style={{ backgroundColor: pos.color }}
                >
                  {pos.name}
                </span>
                <span className="flex-1 text-sm font-medium">{pos.name}</span>
                <div className="flex gap-1 shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => openEdit(pos)}
                    title="Editar posición"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                        disabled={
                          archiveMutation.isPending &&
                          archiveMutation.variables === pos.id
                        }
                        title="Archivar posición"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>¿Archivar posición?</AlertDialogTitle>
                        <AlertDialogDescription>
                          La posición <strong>{pos.name}</strong> se archivará y
                          dejará de estar disponible para nuevas asignaciones.
                          Los jugadores que ya la tuvieran la conservarán.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => archiveMutation.mutate(pos.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Archivar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId !== null ? "Editar posición" : "Nueva posición"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="pos_name">Nombre *</Label>
              <Input
                id="pos_name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Ej: Base, Ala-pívot, Pívot..."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pos_color">Color</Label>
              <div className="flex items-center gap-3">
                <input
                  id="pos_color"
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="h-9 w-14 cursor-pointer rounded border border-input p-0.5"
                />
                <span
                  className="inline-flex items-center rounded px-2.5 py-1 text-sm font-medium text-white"
                  style={{ backgroundColor: form.color }}
                >
                  {form.name || "Posición"}
                </span>
                <span className="text-xs text-muted-foreground font-mono">{form.color}</span>
              </div>
            </div>
            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>Cancelar</Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={saveMutation.isPending || !form.name.trim()}
            >
              {saveMutation.isPending
                ? "Guardando..."
                : editId !== null
                ? "Guardar cambios"
                : "Crear posición"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
