import { apiRequest } from "./client";
import type {
  AddStaffRequest,
  CustomMatchStat,
  CustomMatchStatUpsert,
  StatAttributeCreate,
  TeamStatAttribute,
} from "../types/stat_attribute";

// ── Stat attributes ────────────────────────────────────────────────────────────

export const listStatAttributes = (
  token: string,
  clubId: number,
  teamId: number,
): Promise<TeamStatAttribute[]> =>
  apiRequest<TeamStatAttribute[]>(
    `/clubs/${clubId}/teams/${teamId}/stat-attributes`,
    { token },
  );

export const createStatAttribute = (
  token: string,
  clubId: number,
  teamId: number,
  data: StatAttributeCreate,
): Promise<TeamStatAttribute> =>
  apiRequest<TeamStatAttribute>(
    `/clubs/${clubId}/teams/${teamId}/stat-attributes`,
    { token, method: "POST", body: JSON.stringify(data) },
  );

export const updateStatAttribute = (
  token: string,
  clubId: number,
  teamId: number,
  attrId: number,
  data: import("../types/stat_attribute").StatAttributeUpdate,
): Promise<TeamStatAttribute> =>
  apiRequest<TeamStatAttribute>(
    `/clubs/${clubId}/teams/${teamId}/stat-attributes/${attrId}`,
    { token, method: "PATCH", body: JSON.stringify(data) },
  );

export const archiveStatAttribute = (
  token: string,
  clubId: number,
  teamId: number,
  attrId: number,
): Promise<void> =>
  apiRequest<void>(
    `/clubs/${clubId}/teams/${teamId}/stat-attributes/${attrId}`,
    { token, method: "DELETE" },
  );

// ── Custom match stats ─────────────────────────────────────────────────────────

export const listCustomMatchStats = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<CustomMatchStat[]> =>
  apiRequest<CustomMatchStat[]>(
    `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/custom-stats`,
    { token },
  );

export const upsertCustomMatchStat = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  data: CustomMatchStatUpsert,
): Promise<CustomMatchStat> =>
  apiRequest<CustomMatchStat>(
    `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/custom-stats`,
    { token, method: "PUT", body: JSON.stringify(data) },
  );

export const deleteCustomMatchStat = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  statId: number,
): Promise<void> =>
  apiRequest<void>(
    `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/custom-stats/${statId}`,
    { token, method: "DELETE" },
  );

// ── Team staff management ──────────────────────────────────────────────────────

export const addTeamStaff = (
  token: string,
  clubId: number,
  teamId: number,
  data: AddStaffRequest,
): Promise<import("../types/club").Profile> =>
  apiRequest<import("../types/club").Profile>(
    `/clubs/${clubId}/teams/${teamId}/staff`,
    { token, method: "POST", body: JSON.stringify(data) },
  );

export const removeTeamStaff = (
  token: string,
  clubId: number,
  teamId: number,
  profileId: number,
): Promise<void> =>
  apiRequest<void>(
    `/clubs/${clubId}/teams/${teamId}/staff/${profileId}`,
    { token, method: "DELETE" },
  );
