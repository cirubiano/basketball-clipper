import type { Clip } from "../types";
import { apiRequest } from "./client";

/**
 * GET /clips
 *
 * Returns all clips that belong to the authenticated user, newest first.
 * Each clip includes a pre-signed S3 URL valid for 1 hour.
 */
export async function getClips(token: string): Promise<Clip[]> {
  return apiRequest<Clip[]>("/clips", { token });
}

/**
 * GET /clips/{clipId}
 *
 * Returns a single clip with a fresh pre-signed URL, or throws ApiError(404).
 */
export async function getClip(clipId: number, token: string): Promise<Clip> {
  return apiRequest<Clip>(`/clips/${clipId}`, { token });
}

/**
 * DELETE /clips/{clipId}
 *
 * Deletes the clip from S3 and the database.
 * Resolves to undefined (204 No Content) on success.
 */
export async function deleteClip(
  clipId: number,
  token: string,
): Promise<void> {
  return apiRequest<void>(`/clips/${clipId}`, { method: "DELETE", token });
}
