"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AuthProvider } from "./auth";
import { UploadJobProvider } from "./uploadJob";
import { ToastProvider } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

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
