"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect, type ReactNode } from "react";
import { AuthProvider } from "./auth";
import { UploadJobProvider } from "./uploadJob";
import { ToastProvider } from "./toast";

// ── Offline cache ─────────────────────────────────────────────────────────────
// Persists selected React Query cache entries to localStorage so the app
// shows data immediately on next load, even before the network responds.
//
// Safe queries to persist: structural/reference data that changes infrequently.
// Excluded: auth tokens, upload state, and any query with a user-specific key
// that could leak across browser sessions (auth is handled separately).

const CACHE_KEY = "bc_rq_cache_v1";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/** Query key prefixes that are safe to persist. */
const PERSIST_PREFIXES = [
  "players",
  "positions",
  "roster",
  "teams",
  "seasons",
  "members",
  "drills",
  "drill",
  "playbook",
  "catalog",
  "trainings",
  "matches",
] as const;

type PersistedCache = {
  savedAt: number;
  entries: Array<{ queryKey: unknown; data: unknown }>;
};

function isSafeKey(key: readonly unknown[]): boolean {
  if (!key.length) return false;
  const first = String(key[0]);
  return PERSIST_PREFIXES.some((p) => first === p || first.startsWith(p));
}

function saveCache(qc: QueryClient): void {
  try {
    const entries = qc
      .getQueryCache()
      .getAll()
      .filter((q) => isSafeKey(q.queryKey) && q.state.status === "success" && q.state.data !== undefined)
      .map((q) => ({ queryKey: q.queryKey, data: q.state.data }));

    const payload: PersistedCache = { savedAt: Date.now(), entries };
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore QuotaExceededError and serialization errors
  }
}

function restoreCache(qc: QueryClient): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const payload: PersistedCache = JSON.parse(raw);
    if (Date.now() - payload.savedAt > CACHE_TTL_MS) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    for (const { queryKey, data } of payload.entries) {
      const key = queryKey as readonly unknown[];
      if (isSafeKey(key)) {
        // Only restore if no fresher data is already in cache
        const existing = qc.getQueryState(key);
        if (!existing || existing.status !== "success") {
          qc.setQueryData(key, data);
        }
      }
    }
  } catch {
    localStorage.removeItem(CACHE_KEY);
  }
}

// ── Providers ─────────────────────────────────────────────────────────────────

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // gcTime must outlive staleTime so persisted data survives a page
            // reload before a background refetch completes.
            gcTime: 10 * 60 * 1000, // 10 minutes
            retry: 1,
          },
        },
      }),
  );

  // Restore persisted cache synchronously on first mount
  useEffect(() => {
    restoreCache(queryClient);

    // Save cache on page unload
    const handleUnload = () => saveCache(queryClient);
    window.addEventListener("beforeunload", handleUnload);

    // Also save periodically (every 2 min) in case tab is force-closed
    const interval = setInterval(() => saveCache(queryClient), 2 * 60 * 1000);

    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      clearInterval(interval);
      saveCache(queryClient);
    };
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadJobProvider>
          <ToastProvider>{children}</ToastProvider>
        </UploadJobProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
