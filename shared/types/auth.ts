/**
 * Response from POST /auth/register and POST /auth/login.
 * Mirrors backend app/schemas/auth.py TokenResponse.
 */
export interface TokenResponse {
  access_token: string;
  token_type: "bearer";
}

/** Body for POST /auth/register */
export interface RegisterRequest {
  email: string;
  /** Minimum 8 characters (validated by the backend). */
  password: string;
}

/** Body for POST /auth/login */
export interface LoginRequest {
  email: string;
  password: string;
}
