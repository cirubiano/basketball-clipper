"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { profileLabel } from "@basketball-clipper/shared/types";

/**
 * Selector de perfil activo — siempre visible en la Navbar (RF-010 a RF-014).
 *
 * Muestra el perfil activo como etiqueta compacta. Al hacer clic despliega
 * un dropdown con todos los perfiles del usuario para cambiar de contexto.
 * Cambiar de perfil hace un POST silencioso a /auth/switch-profile y
 * reemplaza el JWT — no requiere cerrar sesión (RF-014).
 */
export function ProfileSelector() {
  const { activeProfile, profiles, switchProfile, clearActiveProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al hacer clic fuera
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSwitch(profileId: number) {
    if (profileId === activeProfile?.id) {
      setOpen(false);
      return;
    }
    setSwitching(true);
    try {
      await switchProfile(profileId);
    } finally {
      setSwitching(false);
      setOpen(false);
    }
  }

  const roleColor: Record<string, string> = {
    technical_director: "bg-purple-100 text-purple-800",
    head_coach: "bg-blue-100 text-blue-800",
    staff_member: "bg-gray-100 text-gray-700",
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={switching}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm shadow-sm hover:bg-gray-50 disabled:opacity-50 transition-colors"
      >
        {activeProfile ? (
          <>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium shrink-0 ${
                roleColor[activeProfile.role] ?? "bg-gray-100"
              }`}
            >
              {activeProfile.role === "technical_director"
                ? "DT"
                : activeProfile.role === "head_coach"
                ? "Coach"
                : "Staff"}
            </span>
            <span className="max-w-[140px] truncate font-medium text-gray-900 text-sm">
              {activeProfile.team_name ?? activeProfile.club_name}
            </span>
            <span className="text-xs text-gray-400 shrink-0 hidden lg:inline">{activeProfile.season_name}</span>
          </>
        ) : (
          <span className="text-gray-500 italic">Selecciona perfil</span>
        )}
        <svg
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-72 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Tus perfiles
          </div>
          <ul className="max-h-72 overflow-y-auto pb-1">
            {/* Espacio personal — siempre visible */}
            <li>
              <button
                onClick={async () => {
                  if (!activeProfile) { setOpen(false); return; }
                  setSwitching(true);
                  try { await clearActiveProfile(); } finally { setSwitching(false); setOpen(false); }
                }}
                className={`flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                  !activeProfile ? "bg-blue-50" : ""
                }`}
              >
                <span className="rounded px-1.5 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 shrink-0">
                  Personal
                </span>
                <span className="text-sm font-medium text-gray-900">Espacio personal</span>
                {!activeProfile && (
                  <svg className="ml-auto h-4 w-4 shrink-0 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            </li>
            {profiles.map((profile) => (
              <li key={profile.id}>
                <button
                  onClick={() => handleSwitch(profile.id)}
                  className={`flex w-full items-start gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors ${
                    profile.id === activeProfile?.id ? "bg-blue-50" : ""
                  }`}
                >
                  <span
                    className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs font-medium ${
                      roleColor[profile.role] ?? "bg-gray-100"
                    }`}
                  >
                    {profile.role === "technical_director"
                      ? "DT"
                      : profile.role === "head_coach"
                      ? "Coach"
                      : "Staff"}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-900">
                      {profile.team_name ?? profile.club_name}
                    </div>
                    <div className="truncate text-xs text-gray-500">
                      {profile.club_name} · {profile.season_name}
                    </div>
                  </div>
                  {profile.id === activeProfile?.id && (
                    <svg
                      className="ml-auto mt-1 h-4 w-4 shrink-0 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
