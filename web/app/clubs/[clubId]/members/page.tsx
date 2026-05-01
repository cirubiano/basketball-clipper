"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Users, Archive, Plus } from "lucide-react";
import {
  getClubMembers,
  addClubMemberByEmail,
  getClubProfiles,
  assignProfile,
  archiveProfile,
  getSeasons,
  getTeams,
} from "@basketball-clipper/shared/api";
import type { ClubMember, Profile, Team, Season } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Breadcrumb } from "@/components/layout/Breadcrumb";

// ── helpers ────────────────────────────────────────────────────────────────────

const roleLabel: Record<string, string> = {
  technical_director: "Director Técnico",
  head_coach: "Entrenador",
  staff_member: "Cuerpo técnico",
};

const roleBadgeClass: Record<string, string> = {
  technical_director: "bg-purple-100 text-purple-800 border-purple-200",
  head_coach: "bg-blue-100 text-blue-800 border-blue-200",
  staff_member: "bg-gray-100 text-gray-700 border-gray-200",
};

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MembersPage({
  params,
}: {
  params: { clubId: string };
}) {
  const clubId = Number(params.clubId);
  const { token, activeProfile } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const isTD = activeProfile?.role === "technical_director";

  // Invite dialog
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Assign profile dialog
  const [assignMember, setAssignMember] = useState<ClubMember | null>(null);
  const [assignForm, setAssignForm] = useState({
    season_id: "",
    team_id: "",
  });
  const [assignError, setAssignError] = useState<string | null>(null);

  // Data queries
  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["club-members", clubId],
    queryFn: () => getClubMembers(token!, clubId),
    enabled: !!token && isTD,
  });

  const { data: profiles = [], isLoading: profilesLoading } = useQuery({
    queryKey: ["club-profiles", clubId],
    queryFn: () => getClubProfiles(token!, clubId),
    enabled: !!token && isTD,
  });

  const { data: seasons = [] } = useQuery({
    queryKey: ["seasons", clubId],
    queryFn: () => getSeasons(token!, clubId),
    enabled: !!token && isTD,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams", clubId, undefined],
    queryFn: () => getTeams(token!, clubId),
    enabled: !!token && isTD,
  });

  const activeSeasons = seasons.filter((s) => s.status !== "archived");
  const activeTeams = teams.filter((t) => !t.archived_at);

  // Group profiles by user_id
  const profilesByUser = profiles.reduce<Record<number, Profile[]>>((acc, p) => {
    (acc[p.user_id] ??= []).push(p);
    return acc;
  }, {});

  // Invite mutation
  const inviteMut = useMutation({
    mutationFn: () => addClubMemberByEmail(token!, clubId, inviteEmail.trim()),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["club-members", clubId] });
      toast("Entrenador invitado correctamente.");
      setInviteOpen(false);
      setInviteEmail("");
      setInviteError(null);
    },
    onError: (e: Error) => setInviteError(e.message),
  });

  // Assign profile mutation
  const assignMut = useMutation({
    mutationFn: () => {
      if (!assignMember) throw new Error("No member selected");
      const seasonId = Number(assignForm.season_id);
      const teamId = Number(assignForm.team_id) || null;
      return assignProfile(token!, clubId, {
        user_id: assignMember.user_id,
        role: "head_coach",
        season_id: seasonId,
        team_id: teamId,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["club-profiles", clubId] });
      const team = activeTeams.find((t) => t.id === Number(assignForm.team_id));
      toast(`Asignado como entrenador de ${team?.name ?? "equipo"}.`);
      setAssignMember(null);
      setAssignForm({ season_id: "", team_id: "" });
      setAssignError(null);
    },
    onError: (e: Error) => setAssignError(e.message),
  });

  // Archive profile mutation
  const archiveMut = useMutation({
    mutationFn: (profileId: number) => archiveProfile(token!, profileId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["club-profiles", clubId] });
      toast("Perfil archivado.");
    },
    onError: () => toast("No se pudo archivar el perfil.", "error"),
  });

  const isLoading = membersLoading || profilesLoading;

  if (!isTD) {
    return (
      <PageShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl text-center text-muted-foreground">
          <p>Solo el Director Técnico puede gestionar los entrenadores del club.</p>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <Breadcrumb items={[
          { label: activeProfile?.club_name ?? "Club", href: `/clubs/${clubId}/teams` },
          { label: "Entrenadores" },
        ]} />

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Entrenadores</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {members.length} miembro{members.length !== 1 ? "s" : ""} en el club
            </p>
          </div>
          <Button onClick={() => { setInviteEmail(""); setInviteError(null); setInviteOpen(true); }}>
            <UserPlus className="h-4 w-4 mr-2" />
            Invitar entrenador
          </Button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
          </div>
        ) : members.length === 0 ? (
          <div className="border rounded-lg p-12 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium mb-1">No hay entrenadores en el club todavía</p>
            <p className="text-xs mb-4">
              Invita a un entrenador con su email de registro en la plataforma.
            </p>
            <Button variant="outline" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invitar primero entrenador
            </Button>
          </div>
        ) : (
          <div className="border rounded-lg divide-y">
            {members.map((member) => {
              const memberProfiles = profilesByUser[member.user_id] ?? [];
              return (
                <MemberRow
                  key={member.id}
                  member={member}
                  profiles={memberProfiles}
                  teams={activeTeams}
                  seasons={seasons}
                  isArchiving={archiveMut.isPending}
                  onAssign={() => {
                    setAssignMember(member);
                    setAssignForm({ season_id: "", team_id: "" });
                    setAssignError(null);
                  }}
                  onArchiveProfile={(profileId) => archiveMut.mutate(profileId)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Invite dialog */}
      <Dialog open={inviteOpen} onOpenChange={(open) => { setInviteOpen(open); if (!open) setInviteError(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invitar entrenador</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email del entrenador *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="entrenador@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
                onKeyDown={(e) => e.key === "Enter" && inviteEmail.trim() && inviteMut.mutate()}
              />
              <p className="text-xs text-muted-foreground">
                La persona debe estar registrada en Basketball Clipper.
              </p>
            </div>
            {inviteError && (
              <Alert variant="destructive">
                <AlertDescription>{inviteError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => inviteMut.mutate()}
              disabled={!inviteEmail.trim() || inviteMut.isPending}
            >
              {inviteMut.isPending ? "Invitando..." : "Invitar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign profile dialog */}
      <Dialog
        open={!!assignMember}
        onOpenChange={(open) => { if (!open) { setAssignMember(null); setAssignError(null); } }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Asignar a equipo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Asigna a <strong>{assignMember?.user_email}</strong> como entrenador principal de un equipo.
            </p>

            <div className="space-y-1.5">
              <Label>Temporada *</Label>
              <Select
                value={assignForm.season_id}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, season_id: v, team_id: "" }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una temporada" />
                </SelectTrigger>
                <SelectContent>
                  {activeSeasons.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                      {s.status === "active" && <span className="ml-2 text-xs text-muted-foreground">(activa)</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Equipo *</Label>
              <Select
                value={assignForm.team_id}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, team_id: v }))}
                disabled={!assignForm.season_id}
              >
                <SelectTrigger>
                  <SelectValue placeholder={assignForm.season_id ? "Selecciona un equipo" : "Elige temporada primero"} />
                </SelectTrigger>
                <SelectContent>
                  {activeTeams
                    .filter((t) => t.season_id === Number(assignForm.season_id))
                    .map((t) => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.name}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {assignError && (
              <Alert variant="destructive">
                <AlertDescription>{assignError}</AlertDescription>
              </Alert>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignMember(null)}>Cancelar</Button>
            <Button
              onClick={() => assignMut.mutate()}
              disabled={!assignForm.season_id || !assignForm.team_id || assignMut.isPending}
            >
              {assignMut.isPending ? "Asignando..." : "Asignar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

// ── MemberRow ─────────────────────────────────────────────────────────────────

function MemberRow({
  member,
  profiles,
  teams,
  seasons,
  isArchiving,
  onAssign,
  onArchiveProfile,
}: {
  member: ClubMember;
  profiles: Profile[];
  teams: Team[];
  seasons: Season[];
  isArchiving: boolean;
  onAssign: () => void;
  onArchiveProfile: (profileId: number) => void;
}) {
  const initials = (member.user_email ?? "?")[0].toUpperCase();

  function teamName(teamId: number | null) {
    if (!teamId) return null;
    return teams.find((t) => t.id === teamId)?.name ?? `Equipo ${teamId}`;
  }

  function seasonName(seasonId: number) {
    return seasons.find((s) => s.id === seasonId)?.name ?? `Temporada ${seasonId}`;
  }

  return (
    <div className="flex items-start gap-3 px-4 py-4">
      {/* Avatar */}
      <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center text-sm font-semibold text-muted-foreground shrink-0 mt-0.5">
        {initials}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{member.user_email ?? `Usuario #${member.user_id}`}</p>

        {profiles.length === 0 ? (
          <p className="text-xs text-muted-foreground mt-0.5">Sin equipo asignado</p>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-1">
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-xs font-medium ${roleBadgeClass[p.role] ?? ""}`}
                >
                  {roleLabel[p.role] ?? p.role}
                  {teamName(p.team_id) && ` · ${teamName(p.team_id)}`}
                  {` · ${seasonName(p.season_id)}`}
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      disabled={isArchiving}
                      className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                      aria-label="Retirar perfil"
                    >
                      <Archive className="h-3 w-3" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Retirar perfil?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Se retirará a <strong>{member.user_email}</strong> del rol{" "}
                        <strong>{roleLabel[p.role]}</strong>
                        {teamName(p.team_id) && <> en <strong>{teamName(p.team_id)}</strong></>}.
                        La persona seguirá siendo miembro del club.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => onArchiveProfile(p.id)}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Retirar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign button */}
      <Button
        variant="outline"
        size="sm"
        onClick={onAssign}
        className="shrink-0 text-xs h-8 gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Asignar equipo
      </Button>
    </div>
  );
}
