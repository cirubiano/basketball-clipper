import type { DrillSummary } from "./drill";

// ── ClubTag ───────────────────────────────────────────────────────────────────

export interface ClubTag {
  id: number;
  club_id: number;
  name: string;
  color: string | null;
  archived_at: string | null;
  created_at: string;
}

export interface ClubTagCreate {
  name: string;
  color?: string | null;
}

export interface ClubTagUpdate {
  name?: string;
  color?: string | null;
}

// ── CatalogEntry ──────────────────────────────────────────────────────────────

export interface CatalogEntry {
  id: number;
  club_id: number;
  drill: DrillSummary;
  original_drill_id: number | null;
  published_by: number;
  tags: ClubTag[];
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublishToCatalogRequest {
  drill_id: number;
  tag_ids?: number[];
}

export interface UpdateCatalogTagsRequest {
  tag_ids: number[];
}

// ── TeamPlaybookEntry ─────────────────────────────────────────────────────────

export interface PlaybookEntry {
  id: number;
  team_id: number;
  drill: DrillSummary;
  added_by: number;
  is_frozen: boolean;
  frozen_at: string | null;
  archived_at: string | null;
  /** Coach annotation visible to all team members. */
  note: string | null;
  created_at: string;
}

export interface AddToPlaybookRequest {
  drill_id: number;
}
