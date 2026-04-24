import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";
import { login as apiLogin, register as apiRegister, getMe } from "@basketball-clipper/shared/api";
import type { LoginRequest, RegisterRequest, User } from "@basketball-clipper/shared/types";

const TOKEN_KEY = "bc_token";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (data: LoginRequest) => Promise<void>;
  register: (data: RegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    isLoading: true,
  });

  useEffect(() => {
    SecureStore.getItemAsync(TOKEN_KEY)
      .then(async (stored) => {
        if (!stored) {
          setState((s) => ({ ...s, isLoading: false }));
          return;
        }
        try {
          const user = await getMe(stored);
          setState({ user, token: stored, isLoading: false });
        } catch {
          await SecureStore.deleteItemAsync(TOKEN_KEY);
          setState({ user: null, token: null, isLoading: false });
        }
      })
      .catch(() => setState((s) => ({ ...s, isLoading: false })));
  }, []);

  const login = useCallback(async (data: LoginRequest) => {
    const { access_token } = await apiLogin(data);
    await SecureStore.setItemAsync(TOKEN_KEY, access_token);
    const user = await getMe(access_token);
    setState({ user, token: access_token, isLoading: false });
  }, []);

  const register = useCallback(
    async (data: RegisterRequest) => {
      await apiRegister(data);
      await login({ email: data.email, password: data.password });
    },
    [login]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    setState({ user: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, register, logout }}>
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
