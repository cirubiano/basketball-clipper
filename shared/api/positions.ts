import type {
  ClubPositionCreate,
  ClubPositionDetail,
  ClubPositionUpdate,
} from "../types";
import { apiRequest } from "./client";

/**
 * GET /clubs/{clubId}/positions
 * Lista las posiciones activas del club.
 */
export function listPositions(
  token: string,
  clubId: number,
): Promise<ClubPositionDetail[]> {
  return apiRequest<ClubPositionDetail[]>(`/clubs/${clubId}/positions`, {
    token,
  });
}

/**
 * POST /clubs/{clubId}/positions
 * Crea una nueva posición para el club (TD o HC).
 */
export function createPosition(
  token: string,
  clubId: number,
  data: ClubPositionCreate,
): Promise<ClubPositionDetail> {
  return apiRequest<ClubPositionDetail>(`/clubs/${clubId}/positions`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * PATCH /clubs/{clubId}/positions/{posId}
 */
export function updatePosition(
  token: string,
  clubId: number,
  posId: number,
  data: ClubPositionUpdate,
): Promise<ClubPositionDetail> {
  return apiRequest<ClubPositionDetail>(
    `/clubs/${clubId}/positions/${posId}`,
    { token, method: "PATCH", body: JSON.stringify(data) },
  );
}

/**
 * DELETE /clubs/{clubId}/positions/{posId}
 * Archiva la posición (soft-delete).
 */
export function archivePosition(
  token: string,
  clubId: number,
  posId: number,
): Promise<void> {
  return apiRequest<void>(`/clubs/${clubId}/positions/${posId}`, {
    token,
    method: "DELETE",
  });
}
