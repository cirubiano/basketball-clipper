"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, BarChart2, ShieldCheck, Plus, Trash2, Pencil, Hash } from "lucide-react";
import {
  listTeamStaff,
  getClubMembers,
  addTeamStaff,
  removeTeamStaff,
  listStatAttributes,
  createStatAttribute,
  updateStatAttribute,
  archiveStatAttribute,
} from "@basketball-clipper/shared/api";
import type { Profile, ClubMember } from "@basketball-clipper/shared/types";
import type { TeamStatAttribute } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
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
import { cn } from "@/lib/utils";

const ROLE_LABEL: Record<string, string> = {
  head_coach: "Entrenador principal",
  staff_member: "Cuerpo técnico",
};

const ROLE_VARIANT: Record<string, "default" | "secondary"> = {
  head_coach: "default",
  staff_member: "secondary",
};

type Tab = "staff" | "estadisticas";

// ── Staff Tab ──────────────────────────────────────────────────────────────────

function StaffTab({
  clubId,
  teamId,
  canManage,
}: {
  clubId: number;
  teamId: number;
  canManage: boolean;
}) {
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const seasonId = activeProfile?.season_id;

  const { data: staff = [], isLoading: staffLoading } = useQuery<Profile[]>({
    queryKey: ["team-staff", clubId, teamId],
    queryFn: () => listTeamStaff(token!, clubId, teamId),
    enabled: !!token,
  });

  const { data: members = [], isLoading: membersLoading } = useQuery<ClubMember[]>({
    queryKey: ["club-members", clubId],
    queryFn: () => getClubMembers(token!, clubId),
    enabled: !!token && canManage && addOpen,
  });

  const staffUserIds = new Set(staff.map((s) => s.user_id));
  const eligibleMembers = members.filter((m) => !staffUserIds.has(m.user_id));

  const addMut = useMutation({
    mutationFn: () =>
      addTeamStaff(token!, clubId, teamId, {
        user_id: parseInt(selectedUserId),
        season_id: seasonId!,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team-staff", clubId, teamId] });
      setAddOpen(false);
      setSelectedUserId("");
    },
  });

  const removeMut = useMutation({
    mutationFn: (profileId: number) => removeTeamStaff(token!, clubId, teamId, profileId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["team-staff", clubId, teamId] }),
  });

  if (staffLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />
            Añadir miembro
          </Button>
        </div>
      )}

      {staff.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
          <Users className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No hay miembros del staff asignados.</p>
          {!canManage && (
            <p className="text-xs text-muted-foreground/70">
              El director técnico o el entrenador pueden añadir miembros.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {staff.map((member) => (
            <div key={member.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                {(member.user_email ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{member.user_email ?? "—"}</p>
                {member.season_name && (
                  <p className="text-xs text-muted-foreground">{member.season_name}</p>
                )}
              </div>
              <Badge variant={ROLE_VARIANT[member.role] ?? "secondary"}>
                {ROLE_LABEL[member.role] ?? member.role}
              </Badge>
              {canManage && member.role === "staff_member" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Retirar del staff</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se eliminará el acceso de <strong>{member.user_email}</strong> a este
                        equipo. El usuario seguirá siendo miembro del club.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => removeMut.mutate(member.id)}
                      >
                        Retirar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Añadir miembro al staff</DialogTitle>
          </DialogHeader>
          {membersLoading ? (
            <div className="space-y-3 py-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : eligibleMembers.length === 0 ? (
            <>
              <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
                <Users className="h-9 w-9 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">
                  No hay miembros del club disponibles para añadir al staff.
                </p>
                <p className="text-xs text-muted-foreground/70">
                  Para añadir más personas, primero invítalas al club desde la sección de miembros.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cerrar</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Miembro del club</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona un miembro..." />
                    </SelectTrigger>
                    <SelectContent>
                      {eligibleMembers.map((m) => (
                        <SelectItem key={m.user_id} value={String(m.user_id)}>
                          {m.user_email ?? `Usuario ${m.user_id}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">
                  El miembro recibirá el rol de <strong>Cuerpo técnico</strong> para
                  la temporada activa de este equipo.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
                <Button disabled={!selectedUserId || addMut.isPending} onClick={() => addMut.mutate()}>
                  {addMut.isPending ? "Añadiendo..." : "Añadir"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Color palette ─────────────────────────────────────────────────────────────

const STAT_COLORS: { key: string; label: string; bg: string }[] = [
  { key: "violet", label: "Violeta",  bg: "bg-violet-500" },
  { key: "blue",   label: "Azul",     bg: "bg-blue-500"   },
  { key: "green",  label: "Verde",    bg: "bg-green-500"  },
  { key: "orange", label: "Naranja",  bg: "bg-orange-500" },
  { key: "rose",   label: "Rojo",     bg: "bg-rose-500"   },
  { key: "purple", label: "Morado",   bg: "bg-purple-500" },
  { key: "teal",   label: "Turquesa", bg: "bg-teal-500"   },
  { key: "amber",  label: "Ámbar",    bg: "bg-amber-400"  },
  { key: "cyan",   label: "Cian",     bg: "bg-cyan-500"   },
  { key: "pink",   label: "Rosa",     bg: "bg-pink-500"   },
];

function colorBg(color: string | null): string {
  return STAT_COLORS.find((c) => c.key === color)?.bg ?? "bg-violet-500";
}

// ── StatAttributeForm — create/edit dialog ─────────────────────────────────────

type AttrForm = {
  name: string;
  short_name: string;
  description: string;
  color: string;
};

const EMPTY_FORM: AttrForm = { name: "", short_name: "", description: "", color: "violet" };

function StatAttributeDialog({
  open,
  onOpenChange,
  initial,
  onSubmit,
  isPending,
  title,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: AttrForm;
  onSubmit: (form: AttrForm) => void;
  isPending: boolean;
  title: string;
}) {
  const [form, setForm] = useState<AttrForm>(initial);

  // Sync when dialog opens with different initial value.
  // Intentionally tracking initial.name (not the full object) to avoid re-render loops.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (open) setForm(initial); }, [open, initial.name]);

  const set = (k: keyof AttrForm, v: string) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input
              placeholder="Ej: Pase de apoyo"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              maxLength={120}
              autoFocus
            />
          </div>
          {/* Short name */}
          <div className="space-y-1.5">
            <Label>Abreviatura <span className="text-xs text-muted-foreground font-normal">(máx. 10 car.) — usada en los botones del partido</span></Label>
            <Input
              placeholder="Ej: APY"
              value={form.short_name}
              onChange={(e) => set("short_name", e.target.value)}
              maxLength={10}
            />
          </div>
          {/* Description */}
          <div className="space-y-1.5">
            <Label>Descripción <span className="text-xs text-muted-foreground font-normal">(opcional)</span></Label>
            <Input
              placeholder="Ej: Pase que genera una canasta de manera indirecta"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              maxLength={300}
            />
          </div>
          {/* Color */}
          <div className="space-y-2">
            <Label>Color del botón</Label>
            <div className="flex flex-wrap gap-2">
              {STAT_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  title={c.label}
                  onClick={() => set("color", c.key)}
                  className={cn(
                    "w-7 h-7 rounded-full transition-all ring-offset-2",
                    c.bg,
                    form.color === c.key ? "ring-2 ring-foreground scale-110" : "hover:scale-110",
                  )}
                />
              ))}
            </div>
            {/* Preview */}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">Vista previa:</span>
              <span className={cn("px-3 py-1 rounded text-white text-xs font-bold", colorBg(form.color))}>
                {form.short_name.trim() || form.name.trim() || "STAT"}
              </span>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            disabled={!form.name.trim() || isPending}
            onClick={() => onSubmit(form)}
          >
            {isPending ? "Guardando..." : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── EstadisticasTab ────────────────────────────────────────────────────────────

function EstadisticasTab({
  clubId,
  teamId,
  canManage,
}: {
  clubId: number;
  teamId: number;
  canManage: boolean;
}) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [editingAttr, setEditingAttr] = useState<TeamStatAttribute | null>(null);

  const { data: attrs = [], isLoading } = useQuery<TeamStatAttribute[]>({
    queryKey: ["stat-attributes", clubId, teamId],
    queryFn: () => listStatAttributes(token!, clubId, teamId),
    enabled: !!token,
  });

  const createMut = useMutation({
    mutationFn: (form: AttrForm) =>
      createStatAttribute(token!, clubId, teamId, {
        name: form.name,
        short_name: form.short_name.trim() || null,
        description: form.description.trim() || null,
        color: form.color || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stat-attributes", clubId, teamId] });
      setAddOpen(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, form }: { id: number; form: AttrForm }) =>
      updateStatAttribute(token!, clubId, teamId, id, {
        name: form.name,
        short_name: form.short_name.trim() || null,
        description: form.description.trim() || null,
        color: form.color || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stat-attributes", clubId, teamId] });
      setEditingAttr(null);
    },
  });

  const archiveMut = useMutation({
    mutationFn: (id: number) => archiveStatAttribute(token!, clubId, teamId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["stat-attributes", clubId, teamId] }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm text-muted-foreground max-w-md">
          Define estadísticas propias del equipo para registrar durante los partidos,
          como pases de apoyo, bloqueos ofensivos o cualquier acción que quieras medir.
        </p>
        {canManage && (
          <Button size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1.5" />
            Nueva estadística
          </Button>
        )}
      </div>

      {attrs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-14 text-center gap-3">
          <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">
            No hay estadísticas personalizadas definidas.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {attrs.map((attr) => (
            <div key={attr.id} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
              {/* Color swatch / button preview */}
              <span className={cn(
                "shrink-0 rounded px-2 py-0.5 text-[11px] font-bold text-white min-w-[2.5rem] text-center",
                colorBg(attr.color),
              )}>
                {attr.short_name ?? attr.name.slice(0, 4).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{attr.name}</p>
                {attr.description && (
                  <p className="text-xs text-muted-foreground truncate">{attr.description}</p>
                )}
              </div>
              <Badge variant="secondary" className="text-xs shrink-0">Contador</Badge>
              {canManage && (
                <div className="flex items-center gap-1 shrink-0">
                  <Button variant="ghost" size="icon" className="h-7 w-7"
                    onClick={() => setEditingAttr(attr)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Eliminar estadística</AlertDialogTitle>
                        <AlertDialogDescription>
                          Se eliminará <strong>{attr.name}</strong> y no aparecerá en futuros
                          partidos. Los datos ya registrados se conservarán.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => archiveMut.mutate(attr.id)}
                        >
                          Eliminar
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <StatAttributeDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        initial={EMPTY_FORM}
        title="Nueva estadística"
        isPending={createMut.isPending}
        onSubmit={(form) => createMut.mutate(form)}
      />

      {/* Edit dialog */}
      {editingAttr && (
        <StatAttributeDialog
          open={!!editingAttr}
          onOpenChange={(v) => { if (!v) setEditingAttr(null); }}
          initial={{
            name: editingAttr.name,
            short_name: editingAttr.short_name ?? "",
            description: editingAttr.description ?? "",
            color: editingAttr.color ?? "violet",
          }}
          title="Editar estadística"
          isPending={updateMut.isPending}
          onSubmit={(form) => updateMut.mutate({ id: editingAttr.id, form })}
        />
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "staff",        label: "Staff",        icon: <Users     className="h-4 w-4" /> },
  { id: "estadisticas", label: "Estadísticas", icon: <BarChart2 className="h-4 w-4" /> },
];

export default function TeamSettingsPage({
  params,
}: {
  params: { teamId: string };
}) {
  const teamId = parseInt(params.teamId, 10);
  const { activeProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("staff");

  const clubId  = activeProfile?.club_id;
  const role    = activeProfile?.role;
  const canManage = role === "head_coach" || role === "technical_director";

  return (
    <PageShell requireAuth requireProfile>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-semibold">Ajustes del equipo</h1>
            <p className="text-sm text-muted-foreground">Configuración y gestión del equipo</p>
          </div>
        </div>

        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                activeTab === tab.id
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "staff" && clubId && (
          <StaffTab clubId={clubId} teamId={teamId} canManage={canManage} />
        )}
        {activeTab === "estadisticas" && clubId && (
          <EstadisticasTab clubId={clubId} teamId={teamId} canManage={canManage} />
        )}
      </div>
    </PageShell>
  );
}
