"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  switchProfile as apiSwitchProfile,
  clearProfile as apiClearProfile,
  getMyProfiles,
} from "@basketball-clipper/shared/api";
import type {
  User,
  LoginRequest,
  RegisterRequest,
  Profile,
} from "@basketball-clipper/shared/types";

const TOKEN_KEY = "bc_token";
const LAST_PROFILE_KEY = "last_profile_id";

interface AuthState {
  user: User | null;
  token: string | null;
  /** Perfil activo. null = sin perfil seleccionado (vista de selector). */
  activeProfile: Profile | null;
  profiles: Profile[];
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => void;
  /** Cambia el perfil activo. Obtiene un nuevo JWT y actualiza el estado. */
  switchProfile: (profileId: number) => Promise<void>;
  /** Vuelve a la vista de selector de perfil (elimina perfil activo del token). */
  clearActiveProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Extrae el profile_id del JWT sin verificación (solo decodifica el payload). */
function getProfileIdFromToken(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.profile_id ?? null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    activeProfile: null,
    profiles: [],
    isLoading: true,
  });

  /** Carga user + perfiles dado un token válido. Si el token no lleva
   *  profile_id, intenta restaurar el último perfil usado (localStorage). */
  const hydrateFromToken = useCallback(async (token: string) => {
    const [user, profiles] = await Promise.all([getMe(token), getMyProfiles(token)]);
    const profileId = getProfileIdFromToken(token);
    let activeProfile = profiles.find((p) => p.id === profileId) ?? null;
    let activeToken = token;

    // Restaurar último perfil si el JWT no trae ninguno activo
    if (!activeProfile && profiles.length > 0) {
      const lastIdStr = localStorage.getItem(LAST_PROFILE_KEY);
      if (lastIdStr) {
        const lastId = parseInt(lastIdStr, 10);
        const found = profiles.find((p) => p.id === lastId);
        if (found) {
          try {
            const { access_token } = await apiSwitchProfile(token, lastId);
            activeToken = access_token;
            localStorage.setItem(TOKEN_KEY, access_token);
            activeProfile = found;
          } catch {
            // Si falla el switch, quedarse en espacio personal y limpiar el hint
            localStorage.removeItem(LAST_PROFILE_KEY);
          }
        }
      }
    }

    setState({ user, token: activeToken, activeProfile, profiles, isLoading: false });
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setState((s) => ({ ...s, isLoading: false }));
      return;
    }
    hydrateFromToken(stored).catch(() => {
      localStorage.removeItem(TOKEN_KEY);
      setState({ user: null, token: null, activeProfile: null, profiles: [], isLoading: false });
    });
  }, [hydrateFromToken]);

  const login = useCallback(
    async (data: LoginRequest) => {
      const { access_token } = await apiLogin(data);
      localStorage.setItem(TOKEN_KEY, access_token);
      await hydrateFromToken(access_token);
    },
    [hydrateFromToken]
  );

  const register = useCallback(
    async (data: RegisterRequest) => {
      await apiRegister(data);
      await login({ email: data.email, password: data.password });
    },
    [login]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LAST_PROFILE_KEY);
    setState({ user: null, token: null, activeProfile: null, profiles: [], isLoading: false });
  }, []);

  const switchProfile = useCallback(
    async (profileId: number) => {
      if (!state.token) return;
      const { access_token } = await apiSwitchProfile(state.token, profileId);
      localStorage.setItem(TOKEN_KEY, access_token);
      localStorage.setItem(LAST_PROFILE_KEY, String(profileId));
      // Actualiza el token y el perfil activo sin re-cargar todos los perfiles
      const activeProfile = state.profiles.find((p) => p.id === profileId) ?? null;
      setState((s) => ({ ...s, token: access_token, activeProfile }));
    },
    [state.token, state.profiles]
  );

  const clearActiveProfile = useCallback(async () => {
    if (!state.token) return;
    const { access_token } = await apiClearProfile(state.token);
    localStorage.setItem(TOKEN_KEY, access_token);
    localStorage.removeItem(LAST_PROFILE_KEY);
    setState((s) => ({ ...s, token: access_token, activeProfile: null }));
  }, [state.token]);

  return (
    <AuthContext.Provider
      value={{ ...state, login, register, logout, switchProfile, clearActiveProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}
