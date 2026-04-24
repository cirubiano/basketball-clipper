"use client";

import { CheckCircle2, Circle, Loader2, XCircle } from "lucide-react";
import type { ProcessingProgress, VideoStatus } from "@basketball-clipper/shared/types";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

interface Step {
  status: VideoStatus;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { status: "processing", label: "Detectando posesión", description: "YOLOv8 analiza jugadores y balón frame a frame" },
  { status: "processing", label: "Cortando clips", description: "FFmpeg genera un clip por cada posesión" },
  { status: "completed", label: "Completado", description: "Todos los clips están listos" },
];

const STEP_INDEX: Partial<Record<VideoStatus, number>> = {
  processing: 0,
  completed: 2,
};

interface ProcessingStatusProps {
  progress: ProcessingProgress;
}

export function ProcessingStatus({ progress }: ProcessingStatusProps) {
  const currentStep = STEP_INDEX[progress.status] ?? -1;
  const isError = progress.status === "invalid" || progress.status === "error";

  if (isError) {
    return (
      <Alert variant="destructive">
        <XCircle className="h-4 w-4" />
        <AlertDescription>
          {progress.status === "invalid"
            ? "El vídeo no parece ser un partido de baloncesto."
            : (progress.error_message ?? "Ocurrió un error durante el procesado.")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Procesando vídeo...</span>
          <span className="font-medium">{Math.round(progress.progress)}%</span>
        </div>
        <Progress value={progress.progress} className="h-2" />
      </div>

      <ol className="space-y-3">
        {STEPS.map((step, idx) => {
          const done = idx < currentStep || progress.status === "completed";
          const active = idx === currentStep && !done;
          return (
            <li key={idx} className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0">
                {done ? (
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                ) : active ? (
                  <Loader2 className="h-5 w-5 text-primary animate-spin" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
              </span>
              <div>
                <p className={cn("text-sm font-medium", !done && !active && "text-muted-foreground")}>
                  {step.label}
                </p>
                {(done || active) && (
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
