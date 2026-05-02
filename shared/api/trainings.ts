import { apiRequest } from "./client";
import type {
  AttendanceUpdate,
  Training,
  TrainingAttendance,
  TrainingBulkCreate,
  TrainingCreate,
  TrainingDrill,
  TrainingDrillAdd,
  TrainingDrillGroup,
  TrainingDrillGroupUpsert,
  TrainingDrillReorderItem,
  TrainingDrillUpdate,
  TrainingUpdate,
} from "../types";

const base = (clubId: number, teamId: number) =>
  `/clubs/${clubId}/teams/${teamId}/trainings`;

export const listTrainings = (
  token: string,
  clubId: number,
  teamId: number,
  seasonId?: number,
): Promise<Training[]> => {
  const url = seasonId
    ? `${base(clubId, teamId)}?season_id=${seasonId}`
    : base(clubId, teamId);
  return apiRequest<Training[]>(url, { token });
};

export const createTraining = (
  token: string,
  clubId: number,
  teamId: number,
  data: TrainingCreate,
): Promise<Training> =>
  apiRequest<Training>(base(clubId, teamId), {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const getTraining = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
): Promise<Training> =>
  apiRequest<Training>(`${base(clubId, teamId)}/${trainingId}`, { token });

export const updateTraining = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  data: TrainingUpdate,
): Promise<Training> =>
  apiRequest<Training>(`${base(clubId, teamId)}/${trainingId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const archiveTraining = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${trainingId}`, {
    token,
    method: "DELETE",
  });

// ── Ejercicios ─────────────────────────────────────────────────────────────────

export const addTrainingDrill = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  data: TrainingDrillAdd,
): Promise<TrainingDrill> =>
  apiRequest<TrainingDrill>(`${base(clubId, teamId)}/${trainingId}/drills`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateTrainingDrill = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  tdId: number,
  data: TrainingDrillUpdate,
): Promise<TrainingDrill> =>
  apiRequest<TrainingDrill>(
    `${base(clubId, teamId)}/${trainingId}/drills/${tdId}`,
    {
      token,
      method: "PATCH",
      body: JSON.stringify(data),
    },
  );

export const removeTrainingDrill = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  tdId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${trainingId}/drills/${tdId}`, {
    token,
    method: "DELETE",
  });

export const reorderTrainingDrills = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  items: TrainingDrillReorderItem[],
): Promise<TrainingDrill[]> =>
  apiRequest<TrainingDrill[]>(`${base(clubId, teamId)}/${trainingId}/drills`, {
    token,
    method: "PATCH",
    body: JSON.stringify(items),
  });

export const upsertDrillGroups = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  tdId: number,
  data: TrainingDrillGroupUpsert,
): Promise<TrainingDrillGroup[]> =>
  apiRequest<TrainingDrillGroup[]>(
    `${base(clubId, teamId)}/${trainingId}/drills/${tdId}/groups`,
    {
      token,
      method: "PUT",
      body: JSON.stringify(data),
    },
  );

// ── Asistencia ────────────────────────────────────────────────────────────────

export const upsertAttendance = (
  token: string,
  clubId: number,
  teamId: number,
  trainingId: number,
  data: AttendanceUpdate,
): Promise<TrainingAttendance> =>
  apiRequest<TrainingAttendance>(
    `${base(clubId, teamId)}/${trainingId}/attendance`,
    {
      token,
      method: "POST",
      body: JSON.stringify(data),
    },
  );

export const bulkCreateTrainings = (
  token: string,
  clubId: number,
  teamId: number,
  data: TrainingBulkCreate,
): Promise<Training[]> =>
  apiRequest<Training[]>(`${base(clubId, teamId)}/bulk`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
