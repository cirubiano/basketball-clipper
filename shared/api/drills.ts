import type {
  Drill,
  DrillCreate,
  DrillSummary,
  DrillType,
  DrillUpdate,
  Tag,
  TagCreate,
  TagUpdate,
} from "../types";
import { apiRequest } from "./client";

// ── Tags ──────────────────────────────────────────────────────────────────────

export function listTags(
  token: string,
  includeArchived = false,
): Promise<Tag[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return apiRequest<Tag[]>(`/drills/tags${qs}`, { token });
}

export function createTag(token: string, data: TagCreate): Promise<Tag> {
  return apiRequest<Tag>("/drills/tags", {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateTag(
  token: string,
  tagId: number,
  data: TagUpdate,
): Promise<Tag> {
  return apiRequest<Tag>(`/drills/tags/${tagId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function archiveTag(token: string, tagId: number): Promise<void> {
  return apiRequest<void>(`/drills/tags/${tagId}`, {
    token,
    method: "DELETE",
  });
}

// ── Drills / Plays ────────────────────────────────────────────────────────────

export function listDrills(
  token: string,
  opts: { type?: DrillType; tagId?: number; includeArchived?: boolean } = {},
): Promise<DrillSummary[]> {
  const params = new URLSearchParams();
  if (opts.type) params.set("type", opts.type);
  if (opts.tagId) params.set("tag_id", String(opts.tagId));
  if (opts.includeArchived) params.set("include_archived", "true");
  const qs = params.toString() ? `?${params}` : "";
  return apiRequest<DrillSummary[]>(`/drills${qs}`, { token });
}

export function createDrill(token: string, data: DrillCreate): Promise<Drill> {
  return apiRequest<Drill>("/drills", {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getDrill(token: string, drillId: number): Promise<Drill> {
  return apiRequest<Drill>(`/drills/${drillId}`, { token });
}

export function updateDrill(
  token: string,
  drillId: number,
  data: DrillUpdate,
): Promise<Drill> {
  return apiRequest<Drill>(`/drills/${drillId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function archiveDrill(token: string, drillId: number): Promise<void> {
  return apiRequest<void>(`/drills/${drillId}`, {
    token,
    method: "DELETE",
  });
}

/** RF-151 — clona un drill dentro de la biblioteca personal. */
export function cloneDrill(token: string, drillId: number): Promise<Drill> {
  return apiRequest<Drill>(`/drills/${drillId}/clone`, {
    token,
    method: "POST",
    body: JSON.stringify({}),
  });
}

/** RF-140 — crea una variante del drill dado. */
export function createVariant(
  token: string,
  drillId: number,
  data: DrillCreate,
): Promise<Drill> {
  return apiRequest<Drill>(`/drills/${drillId}/variants`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
}
