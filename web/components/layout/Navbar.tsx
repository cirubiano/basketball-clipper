"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Film, LogOut, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { ProfileSelector } from "@/components/layout/ProfileSelector";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

export function Navbar() {
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    logout();
    router.push("/login");
  }

  return (
    <header className="sticky top-0 z-[100] w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-14 items-center px-4 gap-4">

        <Link href="/" className="flex items-center gap-2 font-semibold shrink-0">
          <Film className="h-5 w-5 text-primary" />
          <span className="hidden sm:inline">Basketball Clipper</span>
        </Link>

        <div className="flex-1" />

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
