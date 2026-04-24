/**
 * Phase 1: what GET /auth/me returns.
 * Mirrors backend app/schemas/auth.py UserResponse.
 * Field names are snake_case to match the JSON FastAPI returns.
 */
export interface User {
  id: number;
  email: string;
  created_at: string; // ISO 8601
}

/**
 * User roles — defined here for Phases 4+.
 * Not yet returned by any Phase 1 endpoint.
 */
export type UserRole = "coach" | "player" | "admin";
