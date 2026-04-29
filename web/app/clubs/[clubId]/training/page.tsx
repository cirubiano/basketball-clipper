"use client";

import { Dumbbell } from "lucide-react";
import { PageShell } from "@/components/layout/PageShell";

export default function TrainingPage() {
  return (
    <PageShell>
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="rounded-full bg-muted p-5 mb-5">
          <Dumbbell className="h-8 w-8 text-muted-foreground/50" />
        </div>
        <h1 className="text-xl font-semibold mb-2">Entrenamientos</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          El módulo de entrenamientos está en desarrollo y estará disponible
          próximamente. Aquí podrás planificar sesiones, asignar ejercicios
          de la biblioteca y hacer seguimiento de la carga.
        </p>
        <span className="mt-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Próximamente
        </span>
      </div>
    </PageShell>
  );
}
