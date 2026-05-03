import { apiRequest } from "./client";
import type {
  Match,
  MatchCreate,
  MatchPlayer,
  MatchStat,
  MatchStatUpsert,
  MatchUpdate,
  MatchVideo,
  MatchVideoAdd,
} from "../types";

const base = (clubId: number, teamId: number) =>
  `/clubs/${clubId}/teams/${teamId}/matches`;

export const listMatches = (
  token: string,
  clubId: number,
  teamId: number,
  seasonId?: number,
): Promise<Match[]> => {
  const url = seasonId
    ? `${base(clubId, teamId)}?season_id=${seasonId}`
    : base(clubId, teamId);
  return apiRequest<Match[]>(url, { token });
};

export const createMatch = (
  token: string,
  clubId: number,
  teamId: number,
  data: MatchCreate,
): Promise<Match> =>
  apiRequest<Match>(base(clubId, teamId), {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const getMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<Match> =>
  apiRequest<Match>(`${base(clubId, teamId)}/${matchId}`, { token });

export const updateMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  data: MatchUpdate,
): Promise<Match> =>
  apiRequest<Match>(`${base(clubId, teamId)}/${matchId}`, {
    token,
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const archiveMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${matchId}`, {
    token,
    method: "DELETE",
  });

export const deleteMatchPermanently = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${matchId}/permanent`, {
    token,
    method: "DELETE",
  });

// ── Transiciones de estado ────────────────────────────────────────────────────

export const startMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<Match> =>
  apiRequest<Match>(`${base(clubId, teamId)}/${matchId}/start`, {
    token,
    method: "POST",
  });

export const finishMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<Match> =>
  apiRequest<Match>(`${base(clubId, teamId)}/${matchId}/finish`, {
    token,
    method: "POST",
  });

export const cancelMatch = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
): Promise<Match> =>
  apiRequest<Match>(`${base(clubId, teamId)}/${matchId}/cancel`, {
    token,
    method: "POST",
  });

// ── Convocatoria ──────────────────────────────────────────────────────────────

export const addMatchPlayer = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  playerId: number,
): Promise<MatchPlayer> =>
  apiRequest<MatchPlayer>(`${base(clubId, teamId)}/${matchId}/players`, {
    token,
    method: "POST",
    body: JSON.stringify({ player_id: playerId }),
  });

export const removeMatchPlayer = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  playerId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${matchId}/players/${playerId}`, {
    token,
    method: "DELETE",
  });

// ── Vídeos ────────────────────────────────────────────────────────────────────

export const addMatchVideo = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  data: MatchVideoAdd,
): Promise<MatchVideo> =>
  apiRequest<MatchVideo>(`${base(clubId, teamId)}/${matchId}/videos`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });

export const removeMatchVideo = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  videoId: number,
): Promise<void> =>
  apiRequest<void>(`${base(clubId, teamId)}/${matchId}/videos/${videoId}`, {
    token,
    method: "DELETE",
  });

// ── Estadísticas ──────────────────────────────────────────────────────────────

export const upsertMatchStat = (
  token: string,
  clubId: number,
  teamId: number,
  matchId: number,
  data: MatchStatUpsert,
): Promise<MatchStat> =>
  apiRequest<MatchStat>(`${base(clubId, teamId)}/${matchId}/stats`, {
    token,
    method: "POST",
    body: JSON.stringify(data),
  });
