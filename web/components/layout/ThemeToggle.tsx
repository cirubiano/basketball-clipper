"use client";

// #43 — Modo oscuro: toggle que alterna la clase "dark" en <html>
// Estado persistido en localStorage para sobrevivir recargas.
// Detecta la preferencia del sistema si no hay valor guardado.

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // 1. Prefer stored value, fall back to system preference
    let initial = false;
    try {
      const stored = localStorage.getItem("theme");
      if (stored === "dark")  initial = true;
      else if (stored === "light") initial = false;
      else initial = window.matchMedia("(prefers-color-scheme: dark)").matches;
    } catch {
      initial = false;
    }
    setDark(initial);
    document.documentElement.classList.toggle("dark", initial);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch { /* ignore */ }
  }

  if (!mounted) return null;

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      title={dark ? "Modo claro" : "Modo oscuro"}
      className={cn(
        "h-9 w-9 flex items-center justify-center rounded-md",
        "text-muted-foreground hover:text-foreground hover:bg-accent transition-colors",
        className,
      )}
    >
      {dark
        ? <Sun  className="h-4 w-4" />
        : <Moon className="h-4 w-4" />}
    </button>
  );
}
