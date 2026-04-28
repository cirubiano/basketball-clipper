"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Upload, Film, LogOut, UserCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProfileSelector } from "@/components/layout/ProfileSelector";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, activeProfile } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  const isTD = activeProfile?.role === "technical_director";

  const navLinks: Array<{ href: Route; label: string }> = [
    { href: "/", label: "Dashboard" },
    { href: "/videos", label: "Mis vídeos" },
    ...(activeProfile?.club_id
      ? [{ href: `/players` as Route, label: "Jugadores" }]
      : []),
    { href: "/drills", label: "Biblioteca" },
    ...(activeProfile?.club_id
      ? [{ href: `/clubs/${activeProfile.club_id}/catalog` as Route, label: "Catálogo" }]
      : []),
    ...(activeProfile?.team_id
      ? [{ href: `/teams/${activeProfile.team_id}/playbook` as Route, label: "Playbook" }]
      : []),
    // Gestión del club — solo Director Técnico
    ...(isTD && activeProfile?.club_id
      ? [
          { href: `/clubs/${activeProfile.club_id}/teams` as Route, label: "Equipos" },
          { href: `/clubs/${activeProfile.club_id}/seasons` as Route, label: "Temporadas" },
        ]
      : []),
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold mr-6">
          <Film className="h-5 w-5 text-primary" />
          <span>Basketball Clipper</span>
        </Link>

        <nav className="flex items-center gap-1 flex-1">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "px-3 py-1.5 text-sm rounded-md transition-colors",
                pathname === href
                  ? "bg-accent text-accent-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ProfileSelector />

          <Button asChild size="sm">
            <Link href="/upload">
              <Upload className="h-4 w-4 mr-1.5" />
              Subir vídeo
            </Link>
          </Button>

          {user && (
            <>
              <Button variant="ghost" size="icon" asChild title="Mi perfil">
                <Link href="/profile" aria-label="Mi perfil">
                  <UserCircle className="h-4 w-4" />
                </Link>
              </Button>
              <Button variant="ghost" size="icon" onClick={handleLogout} title="Cerrar sesión" aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
