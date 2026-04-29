import type {
  PhotoUploadUrls,
  Player,
  PlayerCreate,
  PlayerUpdate,
  RosterEntry,
  RosterEntryCreate,
  RosterEntryUpdate,
} from "../types";
import { apiRequest } from "./client";

// ── Players ───────────────────────────────────────────────────────────────────

/**
 * GET /clubs/{clubId}/players
 * Lista los jugadores del club. Por defecto excluye archivados.
 */
export function listPlayers(
  token: string,
  clubId: number,
  includeArchived = false,
): Promise<Player[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return apiRequest<Player[]>(`/clubs/${clubId}/players${qs}`, { token });
}

/**
 * POST /clubs/{clubId}/players
 * Crea un jugador nuevo en el club.
 */
export function createPlayer(
  token: string,
  clubId: number,
  data: PlayerCreate,
): Promise<Player> {
  return apiRequest<Player>(`/clubs/${clubId}/players`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * GET /clubs/{clubId}/players/{playerId}
 */
export function getPlayer(
  token: string,
  clubId: number,
  playerId: number,
): Promise<Player> {
  return apiRequest<Player>(`/clubs/${clubId}/players/${playerId}`, { token });
}

/**
 * PATCH /clubs/{clubId}/players/{playerId}
 */
export function updatePlayer(
  token: string,
  clubId: number,
  playerId: number,
  data: PlayerUpdate,
): Promise<Player> {
  return apiRequest<Player>(`/clubs/${clubId}/players/${playerId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

/**
 * POST /clubs/{clubId}/players/photo-upload-url
 * Obtiene una URL prefirmada PUT para subir la foto directamente a S3,
 * y la photo_url permanente que se guardará en el jugador.
 */
export function getPlayerPhotoUploadUrl(
  token: string,
  clubId: number,
  filename: string,
  contentType: string,
): Promise<PhotoUploadUrls> {
  return apiRequest<PhotoUploadUrls>(
    `/clubs/${clubId}/players/photo-upload-url`,
    {
      token,
      method: "POST",
      body: JSON.stringify({ filename, content_type: contentType }),
    },
  );
}

/**
 * DELETE /clubs/{clubId}/players/{playerId}
 * Soft-delete (archivado). Retira al jugador de todas las plantillas activas.
 */
export function archivePlayer(
  token: string,
  clubId: number,
  playerId: number,
): Promise<void> {
  return apiRequest<void>(`/clubs/${clubId}/players/${playerId}`, {
    token,
    method: "DELETE",
  });
}

// ── Roster ────────────────────────────────────────────────────────────────────

/**
 * GET /clubs/{clubId}/teams/{teamId}/roster
 */
export function listRoster(
  token: string,
  clubId: number,
  teamId: number,
  seasonId?: number,
): Promise<RosterEntry[]> {
  const qs = seasonId ? `?season_id=${seasonId}` : "";
  return apiRequest<RosterEntry[]>(
    `/clubs/${clubId}/teams/${teamId}/roster${qs}`,
    { token },
  );
}

/**
 * POST /clubs/{clubId}/teams/{teamId}/roster
 */
export function addToRoster(
  token: string,
  clubId: number,
  teamId: number,
  data: RosterEntryCreate,
): Promise<RosterEntry> {
  return apiRequest<RosterEntry>(`/clubs/${clubId}/teams/${teamId}/roster`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * PATCH /clubs/{clubId}/teams/{teamId}/roster/{entryId}
 */
export function updateRosterEntry(
  token: string,
  clubId: number,
  teamId: number,
  entryId: number,
  data: RosterEntryUpdate,
): Promise<RosterEntry> {
  return apiRequest<RosterEntry>(
    `/clubs/${clubId}/teams/${teamId}/roster/${entryId}`,
    { token, method: "PATCH", body: JSON.stringify(data) },
  );
}

/**
 * DELETE /clubs/{clubId}/teams/{teamId}/roster/{entryId}
 * Retira al jugador de la plantilla (soft-delete de la entrada).
 */
export function removeFromRoster(
  token: string,
  clubId: number,
  teamId: number,
  entryId: number,
): Promise<void> {
  return apiRequest<void>(
    `/clubs/${clubId}/teams/${teamId}/roster/${entryId}`,
    { token, method: "DELETE" },
  );
}
