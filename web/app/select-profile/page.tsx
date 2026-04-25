"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { PageShell } from "@/components/layout/PageShell";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

const roleColor: Record<string, string> = {
  technical_director: "bg-purple-100 text-purple-800",
  head_coach: "bg-blue-100 text-blue-800",
  staff_member: "bg-gray-100 text-gray-700",
};

const roleLabel: Record<string, string> = {
  technical_director: "Director Técnico",
  head_coach: "Entrenador",
  staff_member: "Staff",
};

export default function SelectProfilePage() {
  const { profiles, switchProfile } = useAuth();
  const router = useRouter();
  const [switching, setSwitching] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(profileId: number) {
    setSwitching(profileId);
    setError(null);
    try {
      await switchProfile(profileId);
      router.replace("/");
    } catch {
      setError("No se ha podido seleccionar el perfil. Inténtalo de nuevo.");
    } finally {
      setSwitching(null);
    }
  }

  return (
    // requireProfile=false evita el bucle de redirección
    <PageShell requireProfile={false}>
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Selecciona tu perfil</CardTitle>
            <CardDescription>
              Elige el contexto desde el que quieres trabajar.
              Podrás cambiarlo en cualquier momento desde la barra superior.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {profiles.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                <p className="text-sm">No tienes perfiles asignados.</p>
                <p className="text-sm mt-1">
                  Contacta con el administrador de tu club para que te añada.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {profiles.map((profile) => (
                  <li key={profile.id}>
                    <button
                      onClick={() => handleSelect(profile.id)}
                      disabled={switching !== null}
                      className="flex w-full items-start gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left hover:bg-gray-50 hover:border-gray-300 disabled:opacity-60 transition-colors"
                    >
                      <span
                        className={`mt-0.5 shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                          roleColor[profile.role] ?? "bg-gray-100"
                        }`}
                      >
                        {roleLabel[profile.role] ?? profile.role}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-gray-900">
                          {profile.team_name ?? profile.club_name}
                        </div>
                        <div className="truncate text-xs text-gray-500">
                          {profile.club_name} · {profile.season_name}
                        </div>
                      </div>
                      {switching === profile.id && (
                        <svg
                          className="ml-auto mt-1 h-4 w-4 shrink-0 animate-spin text-gray-400"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z"
                          />
                        </svg>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
