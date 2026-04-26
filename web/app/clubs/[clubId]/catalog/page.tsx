"use client";

import { useState, use } from "react";
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
import { Plus, Trash2, RefreshCw, BookCopy, Tag } from "lucide-react";
import {
  listCatalog,
  listClubTags,
  listDrills,
  publishToCatalog,
  removeFromCatalog,
  updateCatalogCopy,
  copyToCatalogLibrary,
} from "@basketball-clipper/shared/api";
import type { CatalogEntry, DrillSummary } from "@basketball-clipper/shared/types";
import { COURT_LAYOUT_LABELS } from "@basketball-clipper/shared/types";
import { cn } from "@/lib/utils";

export default function ClubCatalogPage({
  params,
}: {
  params: Promise<{ clubId: string }>;
}) {
  const { clubId: clubIdStr } = use(params);
  const clubId = Number(clubIdStr);
  const { token, user } = useAuth();
  const qc = useQueryClient();
  const router = useRouter();

  const [publishOpen, setPublishOpen] = useState(false);
  const [selectedDrillId, setSelectedDrillId] = useState<number | null>(null);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["catalog", clubId],
    queryFn: () => listCatalog(token!, clubId),
    enabled: !!token,
  });

  const { data: clubTags = [] } = useQuery({
    queryKey: ["clubTags", clubId],
    queryFn: () => listClubTags(token!, clubId),
    enabled: !!token,
  });

  const { data: myDrills = [] } = useQuery({
    queryKey: ["drills", "all"],
    queryFn: () => listDrills(token!),
    enabled: !!token && publishOpen,
  });

  const publishMut = useMutation({
    mutationFn: () =>
      publishToCatalog(token!, clubId, {
        drill_id: selectedDrillId!,
        tag_ids: selectedTagIds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["catalog", clubId] });
      setPublishOpen(false);
      setSelectedDrillId(null);
      setSelectedTagIds([]);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const removeMut = useMutation({
    mutationFn: (entryId: number) => removeFromCatalog(token!, clubId, entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", clubId] }),
  });

  const updateCopyMut = useMutation({
    mutationFn: (entryId: number) => updateCatalogCopy(token!, clubId, entryId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["catalog", clubId] }),
  });

  const copyToLibraryMut = useMutation({
    mutationFn: (entryId: number) => copyToCatalogLibrary(token!, clubId, entryId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["drills"] });
      router.push(`/drills/${data.drill_id}/edit`);
    },
  });

  function toggleTag(id: number) {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-6 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Catálogo del club</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Ejercicios y jugadas publicados por los miembros del club
            </p>
          </div>
          <Button onClick={() => setPublishOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Publicar
          </Button>
        </div>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Cargando catálogo...</p>
        ) : entries.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-3">El catálogo está vacío.</p>
            <Button variant="outline" onClick={() => setPublishOpen(true)}>
              Publicar el primero
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {entries.map((entry) => (
              <CatalogEntryRow
                key={entry.id}
                entry={entry}
                isOwnEntry={entry.published_by === user?.id}
                onUpdateCopy={() => updateCopyMut.mutate(entry.id)}
                onCopyToLibrary={() => copyToLibraryMut.mutate(entry.id)}
                onRemove={() => removeMut.mutate(entry.id)}
                isUpdating={updateCopyMut.isPending}
                isCopying={copyToLibraryMut.isPending}
                isRemoving={removeMut.isPending}
              />
            ))}
          </div>
        )}
      </div>

      {/* Publish dialog */}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Publicar en el catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1.5">
              <p className="text-sm font-medium">Ejercicio o jugada</p>
              <Select
                value={selectedDrillId?.toString() ?? ""}
                onValueChange={(v) => setSelectedDrillId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un elemento..." />
                </SelectTrigger>
                <SelectContent>
                  {myDrills.map((d) => (
                    <SelectItem key={d.id} value={d.id.toString()}>
                      {d.name}{" "}
                      <span className="text-muted-foreground text-xs ml-1">
                        ({d.type === "play" ? "Jugada" : "Ejercicio"})
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {clubTags.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium flex items-center gap-1.5">
                  <Tag className="h-3.5 w-3.5" />
                  Tags del club (opcional)
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {clubTags.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTag(t.id)}
                      className={cn(
                        "px-2.5 py-0.5 rounded-full text-xs border transition-colors",
                        selectedTagIds.includes(t.id)
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border text-muted-foreground hover:border-foreground",
                      )}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPublishOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => publishMut.mutate()}
              disabled={!selectedDrillId || publishMut.isPending}
            >
              {publishMut.isPending ? "Publicando..." : "Publicar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function CatalogEntryRow({
  entry,
  isOwnEntry,
  onUpdateCopy,
  onCopyToLibrary,
  onRemove,
  isUpdating,
  isCopying,
  isRemoving,
}: {
  entry: CatalogEntry;
  isOwnEntry: boolean;
  onUpdateCopy: () => void;
  onCopyToLibrary: () => void;
  onRemove: () => void;
  isUpdating: boolean;
  isCopying: boolean;
  isRemoving: boolean;
}) {
  const drill = entry.drill;
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent/30 transition-colors group">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <Badge
            variant={drill.type === "play" ? "default" : "secondary"}
            className="text-xs"
          >
            {drill.type === "play" ? "Jugada" : "Ejercicio"}
          </Badge>
          <span className="text-sm font-medium truncate">{drill.name}</span>
          {!entry.original_drill_id && (
            <Badge variant="outline" className="text-xs text-muted-foreground">
              desvinculado
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {COURT_LAYOUT_LABELS[drill.court_layout]} ·{" "}
          {new Date(entry.updated_at).toLocaleDateString("es-ES")}
          {entry.tags.length > 0 && (
            <> · {entry.tags.map((t) => t.name).join(", ")}</>
          )}
        </p>
      </div>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={onCopyToLibrary}
          disabled={isCopying}
          title="Copiar a mi biblioteca"
        >
          <BookCopy className="h-4 w-4" />
        </Button>
        {isOwnEntry && entry.original_drill_id && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={onUpdateCopy}
            disabled={isUpdating}
            title="Actualizar copia con mi versión actual"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        )}
        {isOwnEntry && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            onClick={onRemove}
            disabled={isRemoving}
            title="Retirar del catálogo"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
