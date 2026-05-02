import { apiRequest } from "./client";
import type { AddToPlaybookRequest, PlaybookEntry } from "../types/catalog";

export interface UpdatePlaybookNotePayload {
  note: string | null;
}

export function listPlaybook(
  token: string,
  clubId: number,
  teamId: number,
): Promise<PlaybookEntry[]> {
  return apiRequest<PlaybookEntry[]>(`/clubs/${clubId}/teams/${teamId}/playbook`, { token });
}

export function addToPlaybook(
  token: string,
  clubId: number,
  teamId: number,
  data: AddToPlaybookRequest,
): Promise<PlaybookEntry> {
  return apiRequest<PlaybookEntry>(`/clubs/${clubId}/teams/${teamId}/playbook`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function removeFromPlaybook(
  token: string,
  clubId: number,
  teamId: number,
  entryId: number,
): Promise<void> {
  return apiRequest<void>(`/clubs/${clubId}/teams/${teamId}/playbook/${entryId}`, {
    token,
    method: "DELETE",
  });
}

export function updatePlaybookNote(
  token: string,
  clubId: number,
  teamId: number,
  entryId: number,
  data: UpdatePlaybookNotePayload,
): Promise<PlaybookEntry> {
  return apiRequest<PlaybookEntry>(
    `/clubs/${clubId}/teams/${teamId}/playbook/${entryId}`,
    { token, method: "PATCH", body: JSON.stringify(data) },
  );
}
