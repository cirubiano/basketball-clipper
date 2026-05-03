import { apiRequest } from "./client";
import type {
  OpponentMatchStat,
  OpponentMatchStatUpsert,
  OpponentPlayer,
  OpponentPlayerBulkCreate,
  OpponentPlayerCreate,
  OpponentPlayerUpdate,
  OpponentTeam,
  OpponentTeamCreate,
  OpponentTeamSummary,
  OpponentTeamUpdate,
} from "../types";

const base = (clubId: number) => `/clubs/${clubId}/opponents`;

// ── OpponentTeam ──────────────────────────────────────────────────────────────

export const listOpponents = (
  token: string,
  clubId: number,
): Promise<OpponentTeamSummary[]> =>
  apiRequest<OpponentTeamSummary[]>(base(clubId), { token });

export const getOpponent = (
  token: string,
  clubId: number,
  oppId: number,
): Promise<OpponentTeam> =>
  apiRequest<OpponentTeam>(`${base(clubId)}/${oppId}`, { token });

export const createOpponent = (
  token: string,
  clubId: number,
  data: OpponentTeamCreate,
): Promise<OpponentTeam> =>
  apiRequest<OpponentTeam>(base(clubId), {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateOpponent = (
  token: string,
  clubId: number,
  oppId: number,
  data: OpponentTeamUpdate,
): Promise<OpponentTeam> =>
  apiRequest<OpponentTeam>(`${base(clubId)}/${oppId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const archiveOpponent = (
  token: string,
  clubId: number,
  oppId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId)}/${oppId}`, { token, method: "DELETE" });

// ── OpponentPlayer ────────────────────────────────────────────────────────────

export const addOpponentPlayer = (
  token: string,
  clubId: number,
  oppId: number,
  data: OpponentPlayerCreate,
): Promise<OpponentPlayer> =>
  apiRequest<OpponentPlayer>(`${base(clubId)}/${oppId}/players`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const updateOpponentPlayer = (
  token: string,
  clubId: number,
  oppId: number,
  playerId: number,
  data: OpponentPlayerUpdate,
): Promise<OpponentPlayer> =>
  apiRequest<OpponentPlayer>(`${base(clubId)}/${oppId}/players/${playerId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const archiveOpponentPlayer = (
  token: string,
  clubId: number,
  oppId: number,
  playerId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId)}/${oppId}/players/${playerId}`, {
    token,
    method: "DELETE",
  });

export const bulkAddOpponentPlayers = (
  token: string,
  clubId: number,
  oppId: number,
  data: OpponentPlayerBulkCreate,
): Promise<OpponentPlayer[]> =>
  apiRequest<OpponentPlayer[]>(`${base(clubId)}/${oppId}/players/bulk`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

// ── OpponentMatchStat ─────────────────────────────────────────────────────────

export const upsertOpponentStat = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  data: OpponentMatchStatUpsert,
): Promise<OpponentMatchStat> =>
  apiRequest<OpponentMatchStat>(
    `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/opponent-stats`,
    { token, method: "POST", body: JSON.stringify(data) },
  );

export const deleteOpponentStat = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  statId: number,
): Promise<void> =>
  apiRequest<void>(
    `/clubs/${clubId}/teams/${teamId}/matches/${matchId}/opponent-stats/${statId}`,
    { token, method: "DELETE" },
  );
