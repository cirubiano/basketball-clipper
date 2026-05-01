// ── Enums ─────────────────────────────────────────────────────────────────────

export type SeasonStatus = "future" | "active" | "archived";

export type UserRole = "technical_director" | "head_coach" | "staff_member";

// ── Club ──────────────────────────────────────────────────────────────────────

export interface Club {
  id: number;
  name: string;
  logo_url: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ClubCreate {
  name: string;
}

// ── Season ────────────────────────────────────────────────────────────────────

export interface Season {
  id: number;
  club_id: number;
  name: string;
  status: SeasonStatus;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
}

export interface SeasonCreate {
  name: string;
  starts_at?: string;
  ends_at?: string;
}

// ── Team ──────────────────────────────────────────────────────────────────────

export interface Team {
  id: number;
  club_id: number;
  season_id: number;
  name: string;
  archived_at: string | null;
  created_at: string;
}

export interface TeamCreate {
  name: string;
  season_id: number;
}

// ── ClubMember ────────────────────────────────────────────────────────────────

export interface ClubMember {
  id: number;
  club_id: number;
  user_id: number;
  user_email: string | null;
  invited_by: number | null;
  joined_at: string;
  archived_at: string | null;
}

// ── Profile ───────────────────────────────────────────────────────────────────

export interface Profile {
  id: number;
  user_id: number;
  club_id: number;
  team_id: number | null;
  season_id: number;
  role: UserRole;
  archived_at: string | null;
  created_at: string;
  /** Campos enriquecidos para el selector de perfil */
  club_name: string | null;
  team_name: string | null;
  season_name: string | null;
  user_email: string | null;
}

/** Etiqueta legible para mostrar en el selector de perfil */
export function profileLabel(profile: Profile): string {
  const roleLabel: Record<UserRole, string> = {
    technical_director: "Director técnico",
    head_coach: "Entrenador",
    staff_member: "Cuerpo técnico",
  };
  const parts = [roleLabel[profile.role]];
  if (profile.team_name) parts.push(profile.team_name);
  if (profile.club_name) parts.push(profile.club_name);
  if (profile.season_name) parts.push(profile.season_name);
  return parts.join(" — ");
}
