"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Navbar } from "./Navbar";
import { Skeleton } from "@/components/ui/skeleton";

interface PageShellProps {
  children: ReactNode;
  requireAuth?: boolean;
  requireProfile?: boolean;
  hideNav?: boolean;
}

export function PageShell({
  children,
  requireAuth = true,
  requireProfile = true,
  hideNav = false,
}: PageShellProps) {
  const { user, activeProfile, profiles, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (requireAuth && !user) {
      router.replace("/login");
      return;
    }
    // Redirigir a /select-profile SOLO cuando el usuario tiene perfiles pero
    // ninguno activo (ej. después de "Cambiar de perfil").
    // Si no tiene perfiles todavía, se le permite el acceso en modo personal.
    if (requireAuth && requireProfile && user && !activeProfile && profiles.length > 0) {
      router.replace("/select-profile");
    }
  }, [isLoading, requireAuth, requireProfile, user, activeProfile, profiles, router]);

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
  if (requireAuth && requireProfile && !activeProfile && profiles.length > 0) return null;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideNav && <Navbar />}
      <main className="flex-1 container mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
