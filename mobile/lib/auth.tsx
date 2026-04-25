import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  getMyProfiles,
  switchProfile as apiSwitchProfile,
  clearProfile as apiClearProfile,
} from "@basketball-clipper/shared/api";
import type {
  LoginRequest,
  RegisterRequest,
  User,
  Profile,
} from "@basketball-clipper/shared/types";

const TOKEN_KEY = "bc_token";

interface AuthState {
  user: User | null;
  token: string | null;
  activeProfile: Profile | null;
  profiles: Profile[];
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  switchProfile: (profileId: number) => Promise<void>;
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

  const hydrateFromToken = useCallback(async (token: string) => {
    const [user, profiles] = await Promise.all([getMe(token), getMyProfiles(token)]);
    const profileId = getProfileIdFromToken(token);
    const activeProfile = profiles.find((p) => p.id === profileId) ?? null;
    setState({ user, token, activeProfile, profiles, isLoading: false });
  }, []);

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (stored) => {
        if (!stored) {
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }
        try {
          await hydrateFromToken(stored);
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setState({ user: null, token: null, activeProfile: null, profiles: [], isLoading: false });
        }
      })
      .catch(() => setState((s) => ({ ...s, isLoading: false })));
  }, [hydrateFromToken]);

  const login = useCallback(async (data: LoginRequest) => {
    const { access_token } = await apiLogin(data);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    await hydrateFromToken(access_token);
  }, [hydrateFromToken]);

  const register = useCallback(
    async (data: RegisterRequest) => {
      await apiRegister(data);
      await login({ email: data.email, password: data.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setState({ user: null, token: null, activeProfile: null, profiles: [], isLoading: false });
  }, []);

  const switchProfile = useCallback(async (profileId: number) => {
    if (!state.token) return;
    const { access_token } = await apiSwitchProfile(state.token, profileId);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    const activeProfile = state.profiles.find((p) => p.id === profileId) ?? null;
    setState((s) => ({ ...s, token: access_token, activeProfile }));
  }, [state.token, state.profiles]);

  const clearActiveProfile = useCallback(async () => {
    if (!state.token) return;
    const { access_token } = await apiClearProfile(state.token);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
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

export async function getStoredToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_KEY);
}
