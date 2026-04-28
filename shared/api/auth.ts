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

/**
 * POST /auth/switch-profile
 *
 * Cambia el perfil activo. Devuelve un nuevo JWT con el claim profile_id
 * actualizado. El frontend debe reemplazar el token almacenado.
 */
export async function switchProfile(
  token: string,
  profileId: number,
): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/switch-profile", {
    method: "POST",
    token,
    body: JSON.stringify({ profile_id: profileId }),
  });
}

/**
 * POST /auth/clear-profile
 *
 * Vuelve a la vista de selector de perfil eliminando el claim profile_id del JWT.
 */
export async function clearProfile(token: string): Promise<TokenResponse> {
  return apiRequest<TokenResponse>("/auth/clear-profile", {
    method: "POST",
    token,
  });
}

/**
 * PATCH /auth/me/password
 *
 * Cambia la contraseña del usuario autenticado.
 * Lanza ApiError(400) si la contraseña actual es incorrecta.
 */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  return apiRequest<void>("/auth/me/password", {
    method: "PATCH",
    token,
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}
