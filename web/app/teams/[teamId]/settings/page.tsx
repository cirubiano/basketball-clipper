"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, BarChart2, ShieldCheck, Mail } from "lucide-react";
import { listTeamStaff } from "@basketball-clipper/shared/api";
import type { Profile } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// ── Helpers ────────────────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  head_coach:  "Entrenador principal",
  staff_member: "Cuerpo técnico",
};

const ROLE_VARIANT: Record<string, "default" | "secondary"> = {
  head_coach:  "default",
  staff_member: "secondary",
};

// ── Tab types ──────────────────────────────────────────────────────────────

type Tab = "staff" | "estadisticas";

// ── Staff tab ──────────────────────────────────────────────────────────────

function StaffTab({ clubId, teamId }: { clubId: number; teamId: number }) {
  const { token } = useAuth();

  const { data: staff = [], isLoading } = useQuery<Profile[]>({
    queryKey: ["team-staff", clubId, teamId],
    queryFn:  () => listTeamStaff(token!, clubId, teamId),
    enabled:  !!token,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (staff.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
        <Users className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm text-muted-foreground">No hay miembros del staff asignados a este equipo.</p>
        <p className="text-xs text-muted-foreground/70">
          El director técnico puede asignar perfiles desde la gestión del club.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {staff.map((member) => (
        <div
          key={member.id}
          className="flex items-center gap-4 rounded-lg border bg-card px-4 py-3"
        >
          {/* Avatar inicial */}
          <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
            {(member.user_email ?? "?").slice(0, 2).toUpperCase()}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {member.user_email ?? "—"}
            </p>
            {member.season_name && (
              <p className="text-xs text-muted-foreground truncate">
                Temporada: {member.season_name}
              </p>
            )}
          </div>

          {/* Rol */}
          <Badge variant={ROLE_VARIANT[member.role] ?? "secondary"}>
            {ROLE_LABEL[member.role] ?? member.role}
          </Badge>
        </div>
      ))}

      <p className="pt-2 text-xs text-muted-foreground">
        Para añadir o retirar miembros del staff, el director técnico puede hacerlo desde la gestión del club.
      </p>
    </div>
  );
}

// ── Estadísticas tab (stub) ────────────────────────────────────────────────

function EstadisticasTab() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
      <BarChart2 className="h-10 w-10 text-muted-foreground/40" />
      <p className="text-sm font-medium">Atributos de estadísticas personalizadas</p>
      <p className="text-sm text-muted-foreground max-w-sm">
        Aquí podrás definir atributos propios del equipo para registrar en los partidos,
        como pases de apoyo, bloqueos ofensivos o cualquier acción que quieras medir.
      </p>
      <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
        Próximamente
      </span>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "staff",        label: "Staff",        icon: <Users      className="h-4 w-4" /> },
  { id: "estadisticas", label: "Estadísticas", icon: <BarChart2  className="h-4 w-4" /> },
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

  return (
    <PageShell requireAuth requireProfile>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <ShieldCheck className="h-6 w-6 text-primary shrink-0" />
          <div>
            <h1 className="text-xl font-semibold">Ajustes del equipo</h1>
            <p className="text-sm text-muted-foreground">
              Configuración y gestión del equipo
            </p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
                activeTab === tab.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div>
          {activeTab === "staff" && clubId && (
            <StaffTab clubId={clubId} teamId={teamId} />
          )}
          {activeTab === "estadisticas" && (
            <EstadisticasTab />
          )}
        </div>
      </div>
    </PageShell>
  );
}
