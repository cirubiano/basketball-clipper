"use client";

// #41 — Onboarding guiado first-run
// Muestra un dialog de bienvenida de 3 pasos la primera vez que el usuario
// accede con sesión iniciada. Se controla con localStorage "onboarding_v1_done".
// Solo se muestra a usuarios autenticados; se omite en páginas de auth.

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Trophy, Film, X, ArrowRight, Check } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "onboarding_v1_done";

const AUTH_PATHS = ["/login", "/register", "/select-profile"];

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: <BookOpen className="h-8 w-8 text-primary" />,
    title: "Bienvenido a Basketball Clipper",
    description:
      "Tu plataforma integral para gestionar equipos, ejercicios, partidos y formación. " +
      "En menos de 2 minutos verás todo lo que puedes hacer.",
    features: [
      { icon: <BookOpen className="h-4 w-4" />, text: "Crea ejercicios y jugadas con el editor de canvas interactivo" },
      { icon: <Trophy className="h-4 w-4" />, text: "Registra partidos, convocatorias y estadísticas en tiempo real" },
      { icon: <Film className="h-4 w-4" />, text: "Sube vídeos de partido y genera clips automáticamente" },
    ],
  },
  {
    icon: <Trophy className="h-8 w-8 text-primary" />,
    title: "Organiza tu club y equipos",
    description:
      "Cada usuario trabaja bajo un perfil de rol: Director Técnico, Entrenador o Staff. " +
      "Si ya perteneces a un club, selecciona tu perfil activo desde la barra superior.",
    features: [
      { icon: <Check className="h-4 w-4 text-green-500" />, text: "Director Técnico — gestiona temporadas, equipos y jugadores del club" },
      { icon: <Check className="h-4 w-4 text-green-500" />, text: "Entrenador — planifica entrenamientos y analiza partidos de tu equipo" },
      { icon: <Check className="h-4 w-4 text-green-500" />, text: "Modo personal — usa tu biblioteca de ejercicios sin perfil de club" },
    ],
  },
  {
    icon: <Film className="h-8 w-8 text-primary" />,
    title: "¿Por dónde empezar?",
    description:
      "Elige la acción que más te interese para comenzar ahora mismo.",
    features: [
      { icon: <BookOpen className="h-4 w-4" />, text: "Ve a «Mi Biblioteca» para crear tu primer ejercicio o jugada" },
      { icon: <Trophy className="h-4 w-4" />, text: "Accede a tu equipo para ver la plantilla y planificar el próximo entrenamiento" },
      { icon: <Film className="h-4 w-4" />, text: "Sube un vídeo de partido para generar clips automáticos de cada posesión" },
    ],
  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function OnboardingWizard() {
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen]     = useState(false);
  const [step, setStep]     = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch { /* ignore */ }
  }, []);

  function dismiss() {
    setOpen(false);
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* ignore */ }
  }

  function next() {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  }

  // Don't render on auth pages or before hydration
  if (!mounted || !user || AUTH_PATHS.some((p) => pathname.startsWith(p))) return null;
  if (!open) return null;

  const current = STEPS[step];
  const isLast  = step === STEPS.length - 1;

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-background/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenida a Basketball Clipper"
    >
      <div className="relative w-full max-w-md rounded-xl border bg-background shadow-2xl overflow-hidden">

        {/* Dismiss button */}
        <button
          onClick={dismiss}
          className="absolute top-3 right-3 h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Omitir introducción"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Progress dots */}
        <div className="flex items-center justify-center gap-1.5 pt-5 pb-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-6 bg-primary" : "w-1.5 bg-border",
              )}
            />
          ))}
        </div>

        {/* Content */}
        <div className="px-6 pt-4 pb-6">
          <div className="flex flex-col items-center text-center mb-5">
            <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              {current.icon}
            </div>
            <h2 className="text-lg font-semibold mb-2">{current.title}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {current.description}
            </p>
          </div>

          <ul className="space-y-2.5 mb-6">
            {current.features.map((f, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="mt-0.5 shrink-0 text-muted-foreground">{f.icon}</span>
                <span className="text-foreground/80">{f.text}</span>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-3">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="flex-1"
                onClick={() => setStep((s) => s - 1)}
              >
                Atrás
              </Button>
            )}
            <Button
              size="sm"
              className="flex-1 gap-1.5"
              onClick={next}
            >
              {isLast ? (
                <>Empezar <Check className="h-4 w-4" /></>
              ) : (
                <>Siguiente <ArrowRight className="h-4 w-4" /></>
              )}
            </Button>
          </div>

          {!isLast && (
            <button
              onClick={dismiss}
              className="mt-3 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Omitir introducción
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
