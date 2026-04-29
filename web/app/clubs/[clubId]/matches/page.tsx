"use client";

import { Swords } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";

export default function MatchesPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="rounded-full bg-muted p-5 mb-5">
          <Swords className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Partidos</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          El módulo de partidos está en desarrollo y estará disponible
          próximamente. Aquí podrás registrar resultados, estadísticas
          y acceder al análisis de vídeo por partido.
        </p>
        <span className="mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Próximamente
        </span>
      </div>
    </PageShell>
  );
}
