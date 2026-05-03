import { apiRequest } from "./client";
import type { Competition, CompetitionCreate, CompetitionUpdate } from "../types";

const base = (clubId: number, teamId: number) =>
  `/clubs/${clubId}/teams/${teamId}/competitions`;

export const listCompetitions = (
  token: string,
  clubId: number,
  teamId: number,
  seasonId?: number,
): Promise<Competition[]> => {
  const url = seasonId
    ? `${base(clubId, teamId)}?season_id=${seasonId}`
    : base(clubId, teamId);
  return apiRequest<Competition[]>(url, { token });
};

export const createCompetition = (
  token: string,
  clubId: number,
  teamId: number,
  data: CompetitionCreate,
): Promise<Competition> =>
  apiRequest<Competition>(base(clubId, teamId), {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateCompetition = (
  token: string,
  clubId: number,
  teamId: number,
  compId: number,
  data: CompetitionUpdate,
): Promise<Competition> =>
  apiRequest<Competition>(`${base(clubId, teamId)}/${compId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const archiveCompetition = (
  token: string,
  clubId: number,
  teamId: number,
  compId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${compId}`, {
    token,
    method: "DELETE",
  });

export const setDefaultCompetition = (
  token: string,
  clubId: number,
  teamId: number,
  compId: number,
): Promise<Competition> =>
  apiRequest<Competition>(`${base(clubId, teamId)}/${compId}/set-default`, {
    token,
    method: "POST",
    body: JSON.stringify({}),
  });
