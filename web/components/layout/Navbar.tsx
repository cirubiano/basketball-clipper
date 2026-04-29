"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Upload, Film, LogOut, UserCircle, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProfileSelector } from "@/components/layout/ProfileSelector";
import { cn } from "@/lib/utils";

interface NavLink {
  href: string;
  label: string;
  soon?: boolean;
}

function buildNavLinks(
  role: string | undefined,
  clubId: number | undefined,
  teamId: number | null | undefined,
): { main: NavLink[]; personal: NavLink[] } {
  // DT: no tiene sección de vídeos — gestiona el club, no analiza partidos
  if (role === "technical_director" && clubId) {
    return {
      main: [
        { href: "/", label: "Inicio" },
        { href: `/clubs/${clubId}/teams`, label: "Equipos" },
        { href: `/clubs/${clubId}/seasons`, label: "Temporadas" },
        { href: `/players`, label: "Jugadores" },
        { href: `/clubs/${clubId}/catalog`, label: "Catálogo" },
      ],
      personal: [
        { href: "/drills", label: "Mi Biblioteca" },
      ],
    };
  }

  const personal: NavLink[] = [
    { href: "/drills", label: "Mi Biblioteca" },
    { href: "/videos", label: "Vídeos" },
  ];

  if (!role || !clubId) {
    // Modo personal / sin perfil de club
    return { main: [{ href: "/", label: "Inicio" }], personal };
  }

  // head_coach | staff_member
  return {
    main: [
      { href: "/", label: "Inicio" },
      ...(teamId ? [{ href: `/teams/${teamId}/roster`, label: "Mi Equipo" }] : []),
      { href: `/clubs/${clubId}/matches`, label: "Partidos", soon: true },
      { href: `/clubs/${clubId}/training`, label: "Entrenamientos", soon: true },
      { href: `/clubs/${clubId}/catalog`, label: "Catálogo" },
    ],
    personal,
  };
}

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, activeProfile } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const role = activeProfile?.role;
  const isTD = role === "technical_director";

  const { main, personal } = buildNavLinks(
    role,
    activeProfile?.club_id ?? undefined,
    activeProfile?.team_id,
  );

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header className="sticky top-0 z-[100] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4 gap-4">

        <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
          <Film className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">Basketball Clipper</span>
        </Link>

        <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto scrollbar-none">
          {main.map(({ href, label, soon }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "relative whitespace-nowrap px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive(href)
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {label}
              {soon && (
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary/10">
                  <Clock className="h-2 w-2 text-primary" />
                </span>
              )}
            </Link>
          ))}

          <div className="mx-2 h-4 w-px bg-border shrink-0" />

          {personal.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "whitespace-nowrap px-3 py-1.5 text-sm rounded-md transition-colors",
                isActive(href)
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <ProfileSelector />

          {/* DT no sube vídeos — eso lo hacen los entrenadores */}
          {!isTD && (
            <>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link href="/upload">
                  <Upload className="h-4 w-4 mr-1.5" />
                  Subir vídeo
                </Link>
              </Button>
              <Button asChild size="icon" variant="ghost" className="sm:hidden" title="Subir vídeo">
                <Link href="/upload">
                  <Upload className="h-4 w-4" />
                </Link>
              </Button>
            </>
          )}

          {user && (
            <>
              <Button variant="ghost" size="icon" asChild title="Mi perfil">
                <Link href="/profile" aria-label="Mi perfil">
                  <UserCircle className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Cerrar sesión"
                aria-label="Cerrar sesión"
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
