/**
 * Phase 1: what GET /auth/me returns.
 * Mirrors backend app/schemas/auth.py UserResponse.
 * Field names are snake_case to match the JSON FastAPI returns.
 */
export interface User {
  id: number;
  email: string;
  is_admin: boolean;
  created_at: string; // ISO 8601
}

