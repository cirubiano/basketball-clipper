"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Info } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Navbar } from "./Navbar";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  const { user, activeProfile, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (requireAuth && !user) {
      router.replace("/login");
    }
  }, [isLoading, requireAuth, user, router]);

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

  // Si la página requiere perfil de club pero no hay ninguno activo,
  // mostrar un banner informativo en lugar de redirigir.
  const showProfileBanner = requireProfile && user && !activeProfile;

  return (
    <div className="min-h-screen flex flex-col">
      {!hideNav && <Navbar />}
      <main className="flex-1 container mx-auto px-4 py-8">
        {showProfileBanner ? (
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <AlertDescription className="text-amber-800">
              Esta sección requiere un perfil de club. Selecciona uno desde el
              selector de perfil en la barra de navegación.
            </AlertDescription>
          </Alert>
        ) : (
          children
        )}
      </main>
    </div>
  );
}
