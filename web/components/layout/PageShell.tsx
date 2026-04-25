"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Navbar } from "./Navbar";
import { Skeleton } from "@/components/ui/skeleton";

interface PageShellProps {
  children: ReactNode;
  /** Si true (default), redirige a /login cuando no hay usuario autenticado. */
  requireAuth?: boolean;
  /**
   * Si true (default), redirige a /select-profile cuando el usuario está
   * autenticado pero no tiene un perfil activo seleccionado.
   * Ponlo a false en la propia página /select-profile para evitar bucle.
   */
  requireProfile?: boolean;
}

export function PageShell({
  children,
  requireAuth = true,
  requireProfile = true,
}: PageShellProps) {
  const { user, activeProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (requireAuth && !user) {
      router.replace("/login");
      return;
    }
    if (requireAuth && requireProfile && user && !activeProfile) {
      router.replace("/select-profile");
    }
  }, [isLoading, requireAuth, requireProfile, user, activeProfile, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <div className="h-14 border-b" />
        <div className="container mx-auto px-4 py-8 space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (requireAuth && !user) return null;
  if (requireAuth && requireProfile && !activeProfile) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
