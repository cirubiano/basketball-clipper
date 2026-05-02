"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Film, LogOut, Clock, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProfileSelector } from "@/components/layout/ProfileSelector";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
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
  if (role === "technical_director" && clubId) {
    return {
      main: [
        { href: "/", label: "Inicio" },
        { href: `/clubs/${clubId}/teams`, label: "Equipos" },
        { href: `/clubs/${clubId}/seasons`, label: "Temporadas" },
        { href: `/players`, label: "Jugadores" },
        { href: `/clubs/${clubId}/positions`, label: "Posiciones" },
        { href: `/clubs/${clubId}/members`, label: "Entrenadores" },
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
    return { main: [{ href: "/", label: "Inicio" }], personal };
  }

  return {
    main: [
      { href: "/", label: "Inicio" },
      ...(teamId ? [{ href: `/teams/${teamId}/roster`, label: "Mi Equipo" }] : []),
      ...(teamId ? [{ href: `/teams/${teamId}/playbook`, label: "Playbook" }] : []),
      ...(teamId ? [{ href: `/teams/${teamId}/matches`, label: "Partidos" }] : []),
      ...(teamId ? [{ href: `/teams/${teamId}/trainings`, label: "Entrenamientos" }] : []),
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
          <button
            onClick={() => {
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
            }}
            className="hidden sm:flex items-center gap-2 rounded-md border border-border bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
            aria-label="Abrir búsqueda"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Buscar</span>
            <kbd className="ml-1 font-mono text-[10px] opacity-70">Ctrl K</kbd>
          </button>

          <ThemeToggle />

          <ProfileSelector />

          {user && (
            <>
              <Link
                href="/profile"
                className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-accent transition-colors min-h-[40px]"
                title="Mi perfil"
              >
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary shrink-0">
                  {user.email.slice(0, 2).toUpperCase()}
                </div>
                <span className="max-w-[120px] truncate text-sm hidden lg:inline text-foreground">
                  {user.email}
                </span>
              </Link>
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
