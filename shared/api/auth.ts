import type { LoginRequest, RegisterRequest, TokenResponse, User } from "../types";
import { apiRequest } from "./client";

/**
 * POST /auth/register
 *
 * Creates a new user account and returns an access token immediately so the
 * caller does not need a separate login step.
 * Throws ApiError(409) if the email is already registered.
 */
export async function register(
  body: RegisterRequest,
): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * POST /auth/login
 *
 * Authenticates with email + password and returns a JWT access token.
 * Throws ApiError(401) on invalid credentials.
 */
export async function login(body: LoginRequest): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GET /auth/me
 *
 * Returns the profile of the currently authenticated user.
 * Throws ApiError(401) if the token is missing or expired.
 */
export async function getMe(token: string): Promise<User> {
  return apiRequest<User>("/auth/me", { token });
}
