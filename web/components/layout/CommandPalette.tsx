"use client";

// #42 — Búsqueda global Cmd+K / Ctrl+K
// Abre un dialog de búsqueda que filtra en tiempo real sobre:
//   - Páginas de navegación rápida
//   - Ejercicios y jugadas de la biblioteca personal
//   - Jugadores del club
// Navega al resultado seleccionado con Enter o click.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Search, BookOpen, Users, LayoutGrid, CalendarDays, Trophy, Dumbbell, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { listDrills, listPlayers } from "@basketball-clipper/shared/api";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

type ResultItem = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
  icon: React.ReactNode;
  group: string;
};

// ── Static nav links (always shown when no query) ────────────────────────────

function navLinks(clubId: number | undefined, teamId: number | null | undefined): ResultItem[] {
  const items: ResultItem[] = [
    { id: "nav-library",   label: "Mi biblioteca",    sublabel: "Ejercicios y jugadas",  href: "/drills",                                  icon: <BookOpen  className="h-4 w-4" />, group: "Navegación" },
    { id: "nav-players",   label: "Jugadores",        sublabel: "Gestión de plantilla",  href: "/players",                                 icon: <Users     className="h-4 w-4" />, group: "Navegación" },
  ];
  if (teamId) {
    items.push(
      { id: "nav-matches",    label: "Partidos",       sublabel: "Lista de partidos",        href: `/teams/${teamId}/matches`,    icon: <Trophy      className="h-4 w-4" />, group: "Navegación" },
      { id: "nav-trainings",  label: "Entrenamientos", sublabel: "Historial y planificación", href: `/teams/${teamId}/trainings`, icon: <Dumbbell    className="h-4 w-4" />, group: "Navegación" },
      { id: "nav-roster",     label: "Plantilla",      sublabel: "Jugadores del equipo",      href: `/teams/${teamId}/roster`,    icon: <CalendarDays className="h-4 w-4" />, group: "Navegación" },
    );
  }
  if (clubId) {
    items.push(
      { id: "nav-catalog", label: "Catálogo del club", sublabel: "Ejercicios publicados", href: `/clubs/${clubId}/catalog`, icon: <LayoutGrid className="h-4 w-4" />, group: "Navegación" },
    );
  }
  return items;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const router = useRouter();
  const { token, activeProfile } = useAuth();
  const clubId = activeProfile?.club_id;
  const teamId = activeProfile?.team_id ?? null;

  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);

  // ── Open/close shortcut ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setCursor(0);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: drills = [] } = useQuery({
    queryKey: ["drills", "all"],
    queryFn:  () => listDrills(token!),
    enabled:  open && !!token,
    staleTime: 30_000,
  });

  const { data: players = [] } = useQuery({
    queryKey: ["players", clubId],
    queryFn:  () => listPlayers(token!, clubId!),
    enabled:  open && !!token && !!clubId,
    staleTime: 30_000,
  });

  // ── Filter ───────────────────────────────────────────────────────────────
  const q = query.trim().toLowerCase();

  const nav = navLinks(clubId, teamId).filter(
    (n) => !q || n.label.toLowerCase().includes(q) || (n.sublabel ?? "").toLowerCase().includes(q),
  );

  const drillResults: ResultItem[] = drills
    .filter((d) => !d.archived_at && (!q || d.name.toLowerCase().includes(q)))
    .slice(0, 5)
    .map((d) => ({
      id:       `drill-${d.id}`,
      label:    d.name,
      sublabel: d.type === "play" ? "Jugada" : "Ejercicio",
      href:     `/drills/${d.id}/edit`,
      icon:     <BookOpen className="h-4 w-4" />,
      group:    "Biblioteca",
    }));

  const playerResults: ResultItem[] = players
    .filter(
      (p) =>
        !p.archived_at &&
        (!q || `${p.first_name} ${p.last_name}`.toLowerCase().includes(q)),
    )
    .slice(0, 5)
    .map((p) => ({
      id:       `player-${p.id}`,
      label:    `${p.first_name} ${p.last_name}`,
      sublabel: "Jugador",
      href:     `/players`,
      icon:     <Users className="h-4 w-4" />,
      group:    "Jugadores",
    }));

  const results: ResultItem[] = q
    ? [...nav, ...drillResults, ...playerResults]
    : nav;

  // ── Keyboard nav ─────────────────────────────────────────────────────────
  const navigate = useCallback(
    (item: ResultItem) => {
      setOpen(false);
      router.push(item.href);
    },
    [router],
  );

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && results[cursor]) {
      navigate(results[cursor]);
    }
  }

  // Scroll cursor into view
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${cursor}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Group headers
  const groups: string[] = [];
  results.forEach((r) => { if (!groups.includes(r.group)) groups.push(r.group); });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-start justify-center pt-[15vh] bg-background/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-xl border bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={onKeyDown}
            placeholder="Buscar páginas, ejercicios, jugadores…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden sm:inline-flex h-5 items-center gap-0.5 rounded border border-border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground">
            Esc
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {results.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Sin resultados para &quot;{query}&quot;
            </p>
          ) : (
            groups.map((group) => {
              const groupItems = results.filter((r) => r.group === group);
              const globalOffset = results.indexOf(groupItems[0]);
              return (
                <div key={group}>
                  <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {group}
                  </p>
                  {groupItems.map((item, i) => {
                    const idx = globalOffset + i;
                    return (
                      <button
                        key={item.id}
                        data-idx={idx}
                        onClick={() => navigate(item)}
                        className={cn(
                          "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                          idx === cursor
                            ? "bg-accent text-accent-foreground"
                            : "hover:bg-accent/50",
                        )}
                      >
                        <span className="shrink-0 text-muted-foreground">{item.icon}</span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium truncate">{item.label}</span>
                          {item.sublabel && (
                            <span className="block text-xs text-muted-foreground truncate">{item.sublabel}</span>
                          )}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-4 border-t px-4 py-2">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px]">↑↓</kbd>
            Navegar
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px]">↵</kbd>
            Abrir
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <kbd className="inline-flex h-4 items-center rounded border border-border bg-muted px-1 font-mono text-[9px]">Esc</kbd>
            Cerrar
          </span>
        </div>
      </div>
    </div>
  );
}
