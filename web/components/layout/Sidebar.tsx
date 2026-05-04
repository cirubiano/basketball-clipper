"use client";

// #1 — Sidebar colapsable: rail ↔ expanded (solo en md+; mobile usa BottomNav)
// Dos modos:
//   expanded (default): 220px — iconos + etiquetas
//   rail (colapsado): 56px — solo iconos con tooltip nativo (title)
// El estado se persiste en sessionStorage para no resetear en cada navegación.

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home, BookOpen, Users, LayoutGrid, Trophy, Dumbbell,
  CalendarDays, ClipboardList, ChevronLeft, ChevronRight,
  Tag, UserCheck, BookMarked, Video,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCompetitions } from "@basketball-clipper/shared/api";
import type { Competition } from "@basketball-clipper/shared/types";

interface SidebarItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function buildItems(
  role: string | undefined,
  clubId: number | undefined,
  teamId: number | null | undefined,
  competicionesHref: string,
): SidebarItem[] {
  if (role === "technical_director" && clubId) {
    return [
      { href: "/",                          label: "Inicio",        icon: <Home          className="h-4 w-4 shrink-0" /> },
      { href: `/clubs/${clubId}/teams`,     label: "Equipos",       icon: <Users         className="h-4 w-4 shrink-0" /> },
      { href: `/clubs/${clubId}/seasons`,   label: "Temporadas",    icon: <CalendarDays  className="h-4 w-4 shrink-0" /> },
      { href: "/players",                   label: "Jugadores",     icon: <ClipboardList className="h-4 w-4 shrink-0" /> },
      { href: `/clubs/${clubId}/positions`, label: "Posiciones",    icon: <Tag           className="h-4 w-4 shrink-0" /> },
      { href: `/clubs/${clubId}/members`,   label: "Entrenadores",  icon: <UserCheck     className="h-4 w-4 shrink-0" /> },
      { href: `/clubs/${clubId}/catalog`,   label: "Catálogo",      icon: <LayoutGrid    className="h-4 w-4 shrink-0" /> },
      { href: "/drills",                    label: "Mi Biblioteca", icon: <BookOpen      className="h-4 w-4 shrink-0" /> },
    ];
  }

  if (teamId) {
    return [
      { href: "/",                           label: "Inicio",         icon: <Home         className="h-4 w-4 shrink-0" /> },
      { href: competicionesHref,             label: "Competiciones",  icon: <Trophy       className="h-4 w-4 shrink-0" /> },
      { href: `/teams/${teamId}/trainings`,  label: "Entrenamientos", icon: <Dumbbell     className="h-4 w-4 shrink-0" /> },
      { href: `/teams/${teamId}/roster`,     label: "Plantilla",      icon: <CalendarDays className="h-4 w-4 shrink-0" /> },
      { href: `/teams/${teamId}/playbook`,   label: "Playbook",       icon: <BookMarked   className="h-4 w-4 shrink-0" /> },
      ...(clubId ? [{ href: `/clubs/${clubId}/catalog`, label: "Catálogo", icon: <LayoutGrid className="h-4 w-4 shrink-0" /> }] : []),
      { href: "/drills",                     label: "Mi Biblioteca",  icon: <BookOpen     className="h-4 w-4 shrink-0" /> },
      { href: "/videos",                     label: "Vídeos",         icon: <Video        className="h-4 w-4 shrink-0" /> },
    ];
  }

  return [
    { href: "/",        label: "Inicio",        icon: <Home     className="h-4 w-4 shrink-0" /> },
    { href: "/drills",  label: "Mi Biblioteca", icon: <BookOpen className="h-4 w-4 shrink-0" /> },
    { href: "/videos",  label: "Vídeos",        icon: <Video    className="h-4 w-4 shrink-0" /> },
  ];
}

const STORAGE_KEY = "sidebar_collapsed";

export function Sidebar() {
  const pathname   = usePathname();
  const { activeProfile, token } = useAuth();
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read persisted state after mount (avoids SSR mismatch)
  useEffect(() => {
    setMounted(true);
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored === "1") setCollapsed(true);
    } catch { /* sessionStorage unavailable */ }
  }, []);

  function toggle() {
    setCollapsed((v) => {
      const next = !v;
      try { sessionStorage.setItem(STORAGE_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  }

  const role   = activeProfile?.role;
  const clubId = activeProfile?.club_id;
  const teamId = activeProfile?.team_id ?? null;

  // Fetch competitions to decide where "Competiciones" should link to
  const { data: competitions = [] } = useQuery<Competition[]>({
    queryKey: ["competitions", teamId, clubId],
    queryFn: () => listCompetitions(token!, clubId!, teamId!),
    enabled: !!token && !!clubId && !!teamId,
    staleTime: 5 * 60 * 1000,
  });

  // If there is an active default competition, jump straight to its matches
  const defaultComp = competitions.find((c) => c.is_default && !c.archived_at);
  const competicionesHref = teamId
    ? defaultComp
      ? `/teams/${teamId}/matches?tab=partidos&comp=${defaultComp.id}`
      : `/teams/${teamId}/matches`
    : "/";

  const items  = buildItems(role, clubId, teamId, competicionesHref);

  // "Competiciones" is active when on any /teams/{id}/matches path
  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    const base = href.split("?")[0];
    return pathname.startsWith(base);
  };

  // Don't render on auth pages
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/select-profile")) {
    return null;
  }

  return (
    <aside
      className={cn(
        "hidden md:flex flex-col shrink-0 border-r bg-background transition-[width] duration-200 ease-in-out",
        // #11: top 56px = height of Navbar; full remaining height
        "sticky top-14 h-[calc(100vh-56px)] overflow-y-auto overflow-x-hidden",
        collapsed ? "w-14" : "w-52",
        !mounted && "w-52", // avoid flash before hydration
      )}
      aria-label="Navegación lateral"
    >
      {/* Nav items */}
      <nav className="flex-1 py-3 flex flex-col gap-0.5 px-2">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-2 py-2 text-sm font-medium transition-colors min-h-[40px]",
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              )}
            >
              {item.icon}
              {!collapsed && (
                <span className="truncate">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className={cn(
          "m-2 flex items-center justify-center rounded-md border border-border p-1.5",
          "text-muted-foreground hover:bg-accent hover:text-foreground transition-colors",
          "min-h-[36px]",
        )}
        title={collapsed ? "Expandir navegación" : "Colapsar navegación"}
        aria-label={collapsed ? "Expandir navegación" : "Colapsar navegación"}
      >
        {collapsed
          ? <ChevronRight className="h-3.5 w-3.5" />
          : <ChevronLeft  className="h-3.5 w-3.5" />}
      </button>
    </aside>
  );
}
