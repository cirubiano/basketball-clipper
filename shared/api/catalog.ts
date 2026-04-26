import { apiRequest } from "./client";
import type {
  CatalogEntry,
  ClubTag,
  ClubTagCreate,
  ClubTagUpdate,
  PublishToCatalogRequest,
  UpdateCatalogTagsRequest,
} from "../types/catalog";

// ── Club Tags ─────────────────────────────────────────────────────────────────

export function listClubTags(token: string, clubId: number): Promise<ClubTag[]> {
  return apiRequest<ClubTag[]>(`/clubs/${clubId}/catalog/tags`, { token });
}

export function createClubTag(
  token: string,
  clubId: number,
  data: ClubTagCreate,
): Promise<ClubTag> {
  return apiRequest<ClubTag>(`/clubs/${clubId}/catalog/tags`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateClubTag(
  token: string,
  clubId: number,
  tagId: number,
  data: ClubTagUpdate,
): Promise<ClubTag> {
  return apiRequest<ClubTag>(`/clubs/${clubId}/catalog/tags/${tagId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function archiveClubTag(
  token: string,
  clubId: number,
  tagId: number,
): Promise<void> {
  return apiRequest<void>(`/clubs/${clubId}/catalog/tags/${tagId}`, {
    token,
    method: "DELETE",
  });
}

// ── Catalog Entries ───────────────────────────────────────────────────────────

export function listCatalog(token: string, clubId: number): Promise<CatalogEntry[]> {
  return apiRequest<CatalogEntry[]>(`/clubs/${clubId}/catalog`, { token });
}

export function publishToCatalog(
  token: string,
  clubId: number,
  data: PublishToCatalogRequest,
): Promise<CatalogEntry> {
  return apiRequest<CatalogEntry>(`/clubs/${clubId}/catalog`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getCatalogEntry(
  token: string,
  clubId: number,
  entryId: number,
): Promise<CatalogEntry> {
  return apiRequest<CatalogEntry>(`/clubs/${clubId}/catalog/${entryId}`, { token });
}

export function updateCatalogCopy(
  token: string,
  clubId: number,
  entryId: number,
): Promise<CatalogEntry> {
  return apiRequest<CatalogEntry>(`/clubs/${clubId}/catalog/${entryId}/update-copy`, {
    token,
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function copyToCatalogLibrary(
  token: string,
  clubId: number,
  entryId: number,
): Promise<{ drill_id: number }> {
  return apiRequest<{ drill_id: number }>(
    `/clubs/${clubId}/catalog/${entryId}/copy-to-library`,
    { token, method: "POST", body: JSON.stringify({}) },
  );
}

export function updateCatalogEntryTags(
  token: string,
  clubId: number,
  entryId: number,
  data: UpdateCatalogTagsRequest,
): Promise<CatalogEntry> {
  return apiRequest<CatalogEntry>(`/clubs/${clubId}/catalog/${entryId}/tags`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function removeFromCatalog(
  token: string,
  clubId: number,
  entryId: number,
): Promise<void> {
  return apiRequest<void>(`/clubs/${clubId}/catalog/${entryId}`, {
    token,
    method: "DELETE",
  });
}
