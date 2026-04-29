"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Dumbbell,
  Copy,
  Trash2,
  ChevronRight,
  Tag,
} from "lucide-react";
import {
  listCatalog,
  copyToCatalogLibrary,
  removeFromCatalog,
} from "@basketball-clipper/shared/api";
import type { CatalogEntry } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

// ── helpers ───────────────────────────────────────────────────────────────────

const typeLabel = { drill: "Ejercicio", play: "Jugada" } as const;
const typeBadgeClass = {
  drill: "bg-amber-100 text-amber-800 border-amber-200",
  play: "bg-blue-100 text-blue-800 border-blue-200",
} as const;

// ── page ──────────────────────────────────────────────────────────────────────

export default function CatalogPage({
  params,
}: {
  params: { clubId: string };
}) {
  const clubId = Number(params.clubId);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const isTD = activeProfile?.role === "technical_director";

  const [copySuccess, setCopySuccess] = useState<number | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["catalog", clubId],
    queryFn: () => listCatalog(token!, clubId),
    enabled: !!token,
  });

  const copyMut = useMutation({
    mutationFn: (entryId: number) => copyToCatalogLibrary(token!, clubId, entryId),
    onSuccess: (_, entryId) => {
      setCopySuccess(entryId);
      setCopyError(null);
      setTimeout(() => setCopySuccess(null), 2500);
    },
    onError: () => setCopyError("No se ha podido copiar el elemento. Inténtalo de nuevo."),
  });

  const removeMut = useMutation({
    mutationFn: (entryId: number) => removeFromCatalog(token!, clubId, entryId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["catalog", clubId] });
    },
  });

  const active = entries.filter((e) => !e.archived_at);

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Catálogo del club</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Jugadas y ejercicios compartidos por el club.
            Copia cualquiera a tu biblioteca personal para editarlo.
          </p>
        </div>

        {copyError && (
          <Alert variant="destructive">
            <AlertDescription>{copyError}</AlertDescription>
          </Alert>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-lg" />
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="rounded-lg border border-dashed p-12 text-center">
            <BookOpen className="h-8 w-8 mx-auto mb-3 text-muted-foreground/40" />
            <p className="text-sm font-medium mb-1">El catálogo está vacío</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Los miembros del club pueden publicar jugadas y ejercicios de su
              biblioteca personal en este catálogo.
            </p>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {active.map((entry) => (
              <CatalogRow
                key={entry.id}
                entry={entry}
                isTD={isTD}
                isCopying={copyMut.isPending && copyMut.variables === entry.id}
                copyDone={copySuccess === entry.id}
                isRemoving={removeMut.isPending && removeMut.variables === entry.id}
                onCopy={() => copyMut.mutate(entry.id)}
                onRemove={() => removeMut.mutate(entry.id)}
              />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}

// ── CatalogRow ────────────────────────────────────────────────────────────────

function CatalogRow({
  entry,
  isTD,
  isCopying,
  copyDone,
  isRemoving,
  onCopy,
  onRemove,
}: {
  entry: CatalogEntry;
  isTD: boolean;
  isCopying: boolean;
  copyDone: boolean;
  isRemoving: boolean;
  onCopy: () => void;
  onRemove: () => void;
}) {
  const { drill } = entry;
  const typeClass = typeBadgeClass[drill.type] ?? "";

  return (
    <div className="flex items-start gap-4 px-4 py-4">
      {/* Icon */}
      <div className="mt-0.5 shrink-0 h-9 w-9 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
        {drill.type === "play" ? (
          <ChevronRight className="h-4 w-4" />
        ) : (
          <Dumbbell className="h-4 w-4" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{drill.name}</span>
          <span
            className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${typeClass}`}
          >
            {typeLabel[drill.type]}
          </span>
        </div>

        {drill.description && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {drill.description}
          </p>
        )}

        {entry.tags.length > 0 && (
          <div className="flex items-center gap-1 mt-1.5 flex-wrap">
            <Tag className="h-3 w-3 text-muted-foreground/60 shrink-0" />
            {entry.tags.map((t) => (
              <Badge key={t.id} variant="secondary" className="text-xs px-1.5 py-0">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          size="sm"
          variant={copyDone ? "default" : "outline"}
          onClick={onCopy}
          disabled={isCopying || copyDone}
          className="text-xs h-8 gap-1.5"
        >
          <Copy className="h-3.5 w-3.5" />
          {copyDone ? "Copiado" : isCopying ? "Copiando…" : "Copiar"}
        </Button>

        {isTD && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                disabled={isRemoving}
                aria-label="Quitar del catálogo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>¿Quitar del catálogo?</AlertDialogTitle>
                <AlertDialogDescription>
                  <strong>{drill.name}</strong> dejará de estar disponible para los
                  miembros del club. Las copias ya realizadas no se ven afectadas.
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
        )}
      </div>
    </div>
  );
}
