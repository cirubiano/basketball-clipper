"use client";

// #2 — Bottom navigation for mobile (< 768px)
// Shows the 4–5 most important links for the active role as a fixed bottom bar.
// Hidden on md+ screens where the top Navbar is visible.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen, Trophy, Dumbbell, Users, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface BottomNavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

function buildItems(
  role: string | undefined,
  clubId: number | undefined,
  teamId: number | null | undefined,
): BottomNavItem[] {
  // TD: club-level navigation
  if (role === "technical_director" && clubId) {
    return [
      { href: "/",                             label: "Inicio",      icon: <Home       className="h-5 w-5" /> },
      { href: `/clubs/${clubId}/teams`,        label: "Equipos",     icon: <Users      className="h-5 w-5" /> },
      { href: "/players",                      label: "Jugadores",   icon: <Users      className="h-5 w-5" /> },
      { href: `/clubs/${clubId}/catalog`,      label: "Catálogo",    icon: <LayoutGrid className="h-5 w-5" /> },
      { href: "/drills",                       label: "Biblioteca",  icon: <BookOpen   className="h-5 w-5" /> },
    ];
  }

  // head_coach / staff_member with a team
  if (teamId) {
    return [
      { href: "/",                              label: "Inicio",         icon: <Home     className="h-5 w-5" /> },
      { href: `/teams/${teamId}/matches`,       label: "Partidos",       icon: <Trophy   className="h-5 w-5" /> },
      { href: `/teams/${teamId}/trainings`,     label: "Entrenos",       icon: <Dumbbell className="h-5 w-5" /> },
      { href: `/teams/${teamId}/roster`,        label: "Plantilla",      icon: <Users    className="h-5 w-5" /> },
      { href: "/drills",                        label: "Biblioteca",     icon: <BookOpen className="h-5 w-5" /> },
    ];
  }

  // Personal / no profile
  return [
    { href: "/",        label: "Inicio",     icon: <Home     className="h-5 w-5" /> },
    { href: "/drills",  label: "Biblioteca", icon: <BookOpen className="h-5 w-5" /> },
  ];
}

export function BottomNav() {
  const pathname = usePathname();
  const { activeProfile } = useAuth();

  const role   = activeProfile?.role;
  const clubId = activeProfile?.club_id;
  const teamId = activeProfile?.team_id ?? null;

  const items = buildItems(role, clubId, teamId);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  // Don't render on auth pages or select-profile
  if (pathname.startsWith("/login") || pathname.startsWith("/register") || pathname.startsWith("/select-profile")) {
    return null;
  }

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-[150] border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
      aria-label="Navegación principal móvil"
    >
      <div className="flex items-stretch h-16">
        {items.map((item) => {
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                "min-h-[44px]", // #11 touch target ≥ 44px
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
              aria-current={active ? "page" : undefined}
            >
              <span className={cn("transition-transform", active && "scale-110")}>
                {item.icon}
              </span>
              <span className="leading-tight truncate max-w-[56px] text-center">{item.label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area spacer for iOS home indicator */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
