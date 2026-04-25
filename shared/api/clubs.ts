import { apiRequest } from "./client";
import type {
  Club,
  ClubCreate,
  ClubMember,
  Profile,
  Season,
  SeasonCreate,
  SeasonStatus,
  Team,
  TeamCreate,
} from "../types";

// ── Clubs ─────────────────────────────────────────────────────────────────────

export const getMyClubs = (token: string): Promise<Club[]> =>
  apiRequest<Club[]>("/clubs/mine", { token });

export const getClub = (token: string, clubId: number): Promise<Club> =>
  apiRequest<Club>(`/clubs/${clubId}`, { token });

/** Solo Admin (RF-022) */
export const createClub = (token: string, data: ClubCreate): Promise<Club> =>
  apiRequest<Club>("/clubs", { token, method: "POST", body: JSON.stringify(data) });

// ── Seasons ───────────────────────────────────────────────────────────────────

export const getSeasons = (token: string, clubId: number): Promise<Season[]> =>
  apiRequest<Season[]>(`/clubs/${clubId}/seasons`, { token });

export const createSeason = (
  token: string,
  clubId: number,
  data: SeasonCreate
): Promise<Season> =>
  apiRequest<Season>(`/clubs/${clubId}/seasons`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateSeasonStatus = (
  token: string,
  clubId: number,
  seasonId: number,
  status: SeasonStatus
): Promise<Season> =>
  apiRequest<Season>(`/clubs/${clubId}/seasons/${seasonId}/status`, {
    token,
    method: "PATCH",
    body: JSON.stringify({ status }),
  });

// ── Teams ─────────────────────────────────────────────────────────────────────

export const getTeams = (
  token: string,
  clubId: number,
  seasonId?: number
): Promise<Team[]> => {
  const params = seasonId ? `?season_id=${seasonId}` : "";
  return apiRequest<Team[]>(`/clubs/${clubId}/teams${params}`, { token });
};

export const getTeam = (
  token: string,
  clubId: number,
  teamId: number
): Promise<Team> => apiRequest<Team>(`/clubs/${clubId}/teams/${teamId}`, { token });

export const createTeam = (
  token: string,
  clubId: number,
  data: TeamCreate
): Promise<Team> =>
  apiRequest<Team>(`/clubs/${clubId}/teams`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const archiveTeam = (
  token: string,
  clubId: number,
  teamId: number
): Promise<void> =>
  apiRequest<void>(`/clubs/${clubId}/teams/${teamId}`, { token, method: "DELETE" });

// ── Members ───────────────────────────────────────────────────────────────────

export const getClubMembers = (
  token: string,
  clubId: number
): Promise<ClubMember[]> => apiRequest<ClubMember[]>(`/clubs/${clubId}/members`, { token });

export const addClubMember = (
  token: string,
  clubId: number,
  userId: number
): Promise<ClubMember> =>
  apiRequest<ClubMember>(`/clubs/${clubId}/members`, {
    token,
    method: "POST",
    body: JSON.stringify({ user_id: userId }),
  });

// ── Profiles ──────────────────────────────────────────────────────────────────

/** Lista los perfiles activos del usuario autenticado (para el selector de perfil) */
export const getMyProfiles = (token: string): Promise<Profile[]> =>
  apiRequest<Profile[]>("/profiles", { token });

export const assignProfile = (
  token: string,
  clubId: number,
  data: {
    user_id: number;
    role: string;
    season_id: number;
    team_id?: number | null;
  }
): Promise<Profile> =>
  apiRequest<Profile>(`/clubs/${clubId}/profiles`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const archiveProfile = (
  token: string,
  profileId: number
): Promise<void> =>
  apiRequest<void>(`/profiles/${profileId}`, { token, method: "DELETE" });
