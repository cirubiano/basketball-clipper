"use client";

import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation, useQueryClient, useQueries } from "@tanstack/react-query";
import { UserPlus, Archive, Pencil, Search, Eye, EyeOff, Phone, Upload, X, Loader2, ZoomIn, ZoomOut, Check } from "lucide-react";
import {
  listPlayers,
  createPlayer,
  updatePlayer,
  archivePlayer,
  listRoster,
  getTeams,
  getPlayerPhotoUploadUrl,
} from "@basketball-clipper/shared/api";
import type { Player, PlayerCreate } from "@basketball-clipper/shared/types";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb } from "@/components/layout/Breadcrumb";
import { cn } from "@/lib/utils";

const EMPTY_FORM: PlayerCreate = {
  first_name: "",
  last_name: "",
  date_of_birth: null,
  position: null,
  photo_url: null,
  phone: null,
};

// ── Avatar ────────────────────────────────────────────────────────────────────

const PREVIEW_SIZE = 200; // px — tamaño del círculo en el editor de recorte
const OUTPUT_SIZE  = 400; // px — resolución de salida del canvas recortado

function PlayerAvatar({ player, size = "md" }: { player: Player; size?: "sm" | "md" | "lg" }) {
  const initials = `${player.first_name[0] ?? ""}${player.last_name[0] ?? ""}`.toUpperCase();
  const dim =
    size === "sm" ? "h-8 w-8 text-xs" :
    size === "lg" ? "h-16 w-16 text-xl" :
    "h-12 w-12 text-sm";

  if (player.photo_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={player.photo_url}
        alt={`${player.first_name} ${player.last_name}`}
        className={cn("rounded-full object-cover shrink-0", dim)}
      />
    );
  }
  return (
    <div
      className={cn(
        "rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground shrink-0",
        dim,
      )}
    >
      {initials}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PlayersPage() {
  const { activeProfile, token } = useAuth();
  const clubId = activeProfile?.club_id;
  const queryClient = useQueryClient();

  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");
  const [teamFilter, setTeamFilter] = useState<string>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editPlayer, setEditPlayer] = useState<Player | null>(null);
  const [form, setForm] = useState<PlayerCreate>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Crop editor ────────────────────────────────────────────────────────────
  const [cropState, setCropState] = useState<{ file: File; objectUrl: string } | null>(null);
  const [cropOffset, setCropOffset] = useState({ x: 0, y: 0 });
  const [cropScale, setCropScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, startOX: 0, startOY: 0 });

  // ── Data ───────────────────────────────────────────────────────────────────

  const { data: players = [], isLoading: loadingPlayers } = useQuery({
    queryKey: ["players", clubId, showArchived],
    queryFn: () => listPlayers(token!, clubId!, showArchived),
    enabled: !!token && !!clubId,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", clubId],
    queryFn: () => getTeams(token!, clubId!),
    enabled: !!token && !!clubId,
  });

  const activeTeams = teams.filter((t) => !t.archived_at);

  // Fetch roster for every active team in parallel
  const rosterQueries = useQueries({
    queries: activeTeams.map((team) => ({
      queryKey: ["roster", clubId, team.id],
      queryFn: () => listRoster(token!, clubId!, team.id),
      enabled: !!token && !!clubId,
    })),
  });

  // Build map: playerId → team names[]
  const playerTeamsMap = useMemo<Map<number, string[]>>(() => {
    const map = new Map<number, string[]>();
    rosterQueries.forEach((q, idx) => {
      if (!q.data) return;
      const teamName = activeTeams[idx]?.name ?? "";
      q.data.forEach((entry) => {
        if (entry.archived_at) return;
        const existing = map.get(entry.player_id) ?? [];
        map.set(entry.player_id, [...existing, teamName]);
      });
    });
    return map;
  }, [rosterQueries, activeTeams]);

  // ── Filter ─────────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return players.filter((p) => {
      const fullName = `${p.first_name} ${p.last_name}`.toLowerCase();
      if (q && !fullName.includes(q)) return false;
      if (teamFilter === "none") {
        const inAnyTeam = rosterQueries.some((rq) =>
          rq.data?.some((e) => !e.archived_at && e.player_id === p.id) ?? false,
        );
        if (inAnyTeam) return false;
      } else if (teamFilter !== "all") {
        const teamId = Number(teamFilter);
        const inTeam = rosterQueries.some((rq, idx) => {
          if (activeTeams[idx]?.id !== teamId) return false;
          return rq.data?.some((e) => !e.archived_at && e.player_id === p.id) ?? false;
        });
        if (!inTeam) return false;
      }
      return true;
    });
  }, [players, search, teamFilter, rosterQueries, activeTeams]);

  const active = filtered.filter((p) => !p.archived_at);
  const archived = filtered.filter((p) => !!p.archived_at);
  const displayed = showArchived ? filtered : active;

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (data: PlayerCreate) => {
      if (editPlayer) return updatePlayer(token!, clubId!, editPlayer.id, data);
      return createPlayer(token!, clubId!, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["players", clubId] });
      setDialogOpen(false);
      setEditPlayer(null);
      setForm(EMPTY_FORM);
      setFormError(null);
    },
    onError: (e: Error) => setFormError(e.message),
  });

  const archiveMutation = useMutation({
    mutationFn: (playerId: number) => archivePlayer(token!, clubId!, playerId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["players", clubId] }),
  });

  // ── Dialog helpers ─────────────────────────────────────────────────────────

  function openCreate() {
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(p: Player) {
    setEditPlayer(p);
    setForm({
      first_name: p.first_name,
      last_name: p.last_name,
      date_of_birth: p.date_of_birth,
      position: p.position,
      photo_url: p.photo_url,
      phone: p.phone,
    });
    setFormError(null);
    setDialogOpen(true);
  }

  function resetCrop() {
    if (cropState) URL.revokeObjectURL(cropState.objectUrl);
    setCropState(null);
    setCropOffset({ x: 0, y: 0 });
    setCropScale(1);
    setIsDragging(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditPlayer(null);
    setForm(EMPTY_FORM);
    setFormError(null);
    setPhotoError(null);
    resetCrop();
  }

  // Selección de archivo → abre editor de recorte (sin subir aún)
  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setPhotoError("La foto no puede superar 5 MB.");
      if (photoInputRef.current) photoInputRef.current.value = "";
      return;
    }

    setPhotoError(null);
    if (cropState) URL.revokeObjectURL(cropState.objectUrl);
    setCropState({ file, objectUrl: URL.createObjectURL(file) });
    setCropOffset({ x: 0, y: 0 });
    setCropScale(1);
  }

  // Aplica el recorte: canvas → blob → S3 → photo_url
  async function applyCrop() {
    if (!cropState) return;
    setPhotoUploading(true);
    setPhotoError(null);

    try {
      const img = new Image();
      img.src = cropState.objectUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(); });

      const canvas = document.createElement("canvas");
      canvas.width  = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext("2d")!;

      // Replicamos: object-fit:cover en PREVIEW_SIZE, luego scale+translate
      const ratio    = OUTPUT_SIZE / PREVIEW_SIZE;
      const fitScale = Math.max(OUTPUT_SIZE / img.naturalWidth, OUTPUT_SIZE / img.naturalHeight);
      const rw = img.naturalWidth  * fitScale * cropScale;
      const rh = img.naturalHeight * fitScale * cropScale;
      const cx = OUTPUT_SIZE / 2 + cropOffset.x * ratio;
      const cy = OUTPUT_SIZE / 2 + cropOffset.y * ratio;
      ctx.drawImage(img, cx - rw / 2, cy - rh / 2, rw, rh);

      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej()), "image/jpeg", 0.92),
      );

      const { upload_url, photo_url } = await getPlayerPhotoUploadUrl(
        token!, clubId!, "photo.jpg", "image/jpeg",
      );
      await fetch(upload_url, { method: "PUT", body: blob, headers: { "Content-Type": "image/jpeg" } });

      resetCrop();
      setForm((f) => ({ ...f, photo_url }));
    } catch {
      setPhotoError("Error al subir la foto. Inténtalo de nuevo.");
    } finally {
      setPhotoUploading(false);
    }
  }

  // Drag handlers para el editor de recorte
  function onCropPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, startOX: cropOffset.x, startOY: cropOffset.y };
  }
  function onCropPointerMove(e: React.PointerEvent) {
    if (!isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setCropOffset({ x: dragRef.current.startOX + dx, y: dragRef.current.startOY + dy });
  }
  function onCropPointerUp() { setIsDragging(false); }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <Breadcrumb items={[
          { label: activeProfile?.club_name ?? "Club", href: clubId ? `/clubs/${clubId}/teams` : "/" },
          { label: "Jugadores" },
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Jugadores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {active.length} jugador{active.length !== 1 ? "es" : ""} activo{active.length !== 1 ? "s" : ""}
              {archived.length > 0 && ` · ${archived.length} archivado${archived.length !== 1 ? "s" : ""}`}
            </p>
          </div>
          <Button onClick={openCreate}>
            <UserPlus className="h-4 w-4 mr-2" />
            Nuevo jugador
          </Button>
        </div>

        {/* Search + team filter + archive toggle */}
        <div className="flex gap-2 mb-4 flex-wrap sm:flex-nowrap">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {activeTeams.length > 0 && (
            <Select value={teamFilter} onValueChange={setTeamFilter}>
              <SelectTrigger className="w-full sm:w-44 shrink-0">
                <SelectValue placeholder="Todos los equipos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los equipos</SelectItem>
                {activeTeams.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
                <SelectItem value="none">Sin equipo</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Button
            variant={showArchived ? "secondary" : "outline"}
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => setShowArchived((v) => !v)}
            title={showArchived ? "Ocultar archivados" : "Mostrar archivados"}
          >
            {showArchived ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            <span className="hidden sm:inline">
              {showArchived ? "Ocultar archivados" : "Ver archivados"}
            </span>
          </Button>
        </div>

        {/* Player list */}
        {loadingPlayers ? (
          <div className="text-muted-foreground text-sm">Cargando...</div>
        ) : displayed.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <UserPlus className="h-8 w-8 mx-auto mb-3 opacity-40" />
            {search ? (
              <p className="font-medium">No hay jugadores que coincidan con &quot;{search}&quot;</p>
            ) : (
              <>
                <p className="font-medium mb-1">No hay jugadores en el club todavía</p>
                <p className="text-sm mb-4">
                  Añade jugadores para poder asignarlos a equipos y gestionar plantillas.
                </p>
                <Button onClick={openCreate}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Añadir primer jugador
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {displayed.map((p) => {
              const teamNames = playerTeamsMap.get(p.id) ?? [];
              const isArchived = !!p.archived_at;
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-4 px-4 py-3",
                    isArchived && "opacity-60",
                  )}
                >
                  {/* Avatar */}
                  <PlayerAvatar player={p} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {p.first_name} {p.last_name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {/* Teams */}
                      {teamNames.length > 0 ? (
                        <div className="flex gap-1 flex-wrap">
                          {teamNames.map((name) => (
                            <span
                              key={name}
                              className="inline-flex items-center rounded px-1.5 py-0.5 text-xs bg-blue-50 text-blue-700"
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin equipo</span>
                      )}
                      {/* Phone */}
                      {p.phone && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Phone className="h-3 w-3" />
                          {p.phone}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Archived badge */}
                  {isArchived && <Badge variant="secondary">Archivado</Badge>}

                  {/* Actions — only for active players */}
                  {!isArchived && (
                    <div className="flex gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openEdit(p)}
                        title="Editar jugador"
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
                              archiveMutation.variables === p.id
                            }
                            title="Archivar jugador"
                          >
                            <Archive className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>¿Archivar jugador?</AlertDialogTitle>
                            <AlertDialogDescription>
                              <strong>
                                {p.first_name} {p.last_name}
                              </strong>{" "}
                              quedará archivado y dejará de aparecer en los
                              listados activos. Puedes recuperarlo más adelante.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => archiveMutation.mutate(p.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Archivar
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog crear / editar jugador */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editPlayer ? "Editar jugador" : "Nuevo jugador"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-2">

            {/* ── Editor de recorte ─────────────────────────────────── */}
            {cropState ? (
              <div className="flex flex-col items-center gap-3">
                <p className="text-sm font-medium">Ajusta la foto</p>
                <p className="text-xs text-muted-foreground -mt-2">
                  Arrastra para centrar · Usa el control de zoom
                </p>

                {/* Círculo interactivo */}
                <div
                  className="relative overflow-hidden rounded-full border-2 border-primary/40 select-none"
                  style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, cursor: isDragging ? "grabbing" : "grab" }}
                  onPointerDown={onCropPointerDown}
                  onPointerMove={onCropPointerMove}
                  onPointerUp={onCropPointerUp}
                  onPointerCancel={onCropPointerUp}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={cropState.objectUrl}
                    alt="Recorte"
                    draggable={false}
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      transform: `translate(${cropOffset.x}px, ${cropOffset.y}px) scale(${cropScale})`,
                      transformOrigin: "center",
                      pointerEvents: "none",
                      userSelect: "none",
                    }}
                  />
                </div>

                {/* Zoom */}
                <div className="flex items-center gap-3 w-full max-w-xs">
                  <Button
                    variant="outline" size="icon"
                    className="h-7 w-7 shrink-0"
                    type="button"
                    onClick={() => setCropScale((s) => Math.max(1, +(s - 0.1).toFixed(1)))}
                  >
                    <ZoomOut className="h-3.5 w-3.5" />
                  </Button>
                  <input
                    type="range" min={100} max={300} step={5}
                    value={Math.round(cropScale * 100)}
                    onChange={(e) => setCropScale(Number(e.target.value) / 100)}
                    className="flex-1 h-1.5 rounded-full accent-primary"
                  />
                  <Button
                    variant="outline" size="icon"
                    className="h-7 w-7 shrink-0"
                    type="button"
                    onClick={() => setCropScale((s) => Math.min(3, +(s + 0.1).toFixed(1)))}
                  >
                    <ZoomIn className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {photoError && <p className="text-xs text-destructive">{photoError}</p>}

                {/* Acciones del editor */}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" type="button" onClick={resetCrop} disabled={photoUploading}>
                    Cancelar
                  </Button>
                  <Button size="sm" type="button" onClick={applyCrop} disabled={photoUploading}>
                    {photoUploading ? (
                      <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Subiendo...</>
                    ) : (
                      <><Check className="h-3.5 w-3.5 mr-1.5" />Aplicar</>
                    )}
                  </Button>
                </div>
              </div>
            ) : (
            /* ── Foto normal + picker ────────────────────────────────── */
            <div className="flex flex-col items-center gap-3">
              <PlayerAvatar
                player={{
                  ...(editPlayer ?? { id: 0, club_id: 0, date_of_birth: null, position: null, phone: null, archived_at: null, created_at: "" }),
                  first_name: form.first_name || editPlayer?.first_name || "?",
                  last_name: form.last_name || editPlayer?.last_name || "?",
                  photo_url: form.photo_url ?? null,
                }}
                size="lg"
              />
              <div className="flex items-center gap-2 flex-wrap justify-center">
                <Button
                  variant="outline" size="sm" type="button"
                  disabled={photoUploading}
                  onClick={() => photoInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  {form.photo_url ? "Cambiar foto" : "Subir foto"}
                </Button>
                {form.photo_url && (
                  <Button
                    variant="destructive" size="sm" type="button"
                    onClick={() => setForm((f) => ({ ...f, photo_url: null }))}
                  >
                    <X className="h-3.5 w-3.5 mr-1" />
                    Quitar foto
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">JPG, PNG o WebP · Máx. 5 MB</p>
              {photoError && <p className="text-xs text-destructive">{photoError}</p>}
            </div>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handlePhotoChange}
            />

            {/* Name */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">Nombre *</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))}
                  placeholder="Pau"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Apellidos *</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))}
                  placeholder="Gasol"
                />
              </div>
            </div>

            {/* Phone */}
            <div className="space-y-1.5">
              <Label htmlFor="phone">
                Teléfono{" "}
                <span className="text-muted-foreground font-normal">(opcional)</span>
              </Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value || null }))}
                placeholder="+34 600 000 000"
              />
            </div>

            {formError && (
              <Alert variant="destructive">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancelar
            </Button>
            <Button
              onClick={() => saveMutation.mutate(form)}
              disabled={
                saveMutation.isPending ||
                !!cropState ||
                photoUploading ||
                !form.first_name.trim() ||
                !form.last_name.trim()
              }
            >
              {saveMutation.isPending
                ? "Guardando..."
                : editPlayer
                ? "Guardar cambios"
                : "Crear jugador"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
