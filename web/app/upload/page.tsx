"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { VideoUploader } from "@/components/video/VideoUploader";
import { ProcessingStatus } from "@/components/video/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Info } from "lucide-react";
import { getStoredToken, useAuth } from "@/lib/auth";
import { useUploadJob } from "@/lib/uploadJob";
import Link from "next/link";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function UploadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeProfile } = useAuth();
  const { job, startUpload, cancel, clearJob } = useUploadJob();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  // returnTo: URL to navigate after upload completes (e.g. match detail page)
  const returnTo = searchParams.get("returnTo");
  const opponent = searchParams.get("opponent");

  const isTD = activeProfile?.role === "technical_director";

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setUploadError(null);
    if (!title) {
      const stem = f.name.replace(/\.[^.]+$/, "");
      setTitle(stem);
    }
  }, [title]);

  async function handleSubmit() {
    if (!file) return;
    if (title.trim().length < 3) {
      setUploadError("El título debe tener al menos 3 caracteres.");
      return;
    }
    const token = getStoredToken();
    if (!token) return;
    setUploadError(null);

    try {
      await startUpload(file, title.trim(), token);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Error al subir el vídeo.");
    }
  }

  const isUploading = job?.stage === "uploading";
  const isProcessing = job?.stage === "processing";
  const isDone = job?.stage === "done";
  const isError = job?.stage === "error";
  const canStartNew = !job || isDone || isError;

  // Auto-redirect to returnTo when processing completes
  useEffect(() => {
    if (isDone && returnTo) {
      // Validate returnTo is a relative path (prevent open redirect)
      if (returnTo.startsWith("/")) {
        clearJob();
        router.push(returnTo);
      }
    }
  }, [isDone, returnTo, clearJob, router]);

  if (isTD) {
    return (
      <PageShell>
        <div className="max-w-xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Subir vídeo</h1>
          </div>
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <Info className="h-4 w-4 shrink-0 text-amber-600" />
            <AlertDescription>
              Para subir vídeos necesitas estar en el perfil de entrenador de un equipo.
              Cámbialo desde el{" "}
              <button
                onClick={() => {
                  const selector = document.querySelector<HTMLButtonElement>("[data-profile-selector]");
                  selector?.click();
                }}
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                selector de perfil
              </button>
              {" "}en la barra superior.
            </AlertDescription>
          </Alert>
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-xl mx-auto space-y-6">
        <div className="flex items-start gap-3">
          {returnTo && (
            <Button asChild variant="ghost" size="icon" className="mt-0.5 shrink-0">
              <Link href={returnTo} aria-label="Volver">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">Subir vídeo</h1>
            {!returnTo && (
              <p className="text-muted-foreground text-sm mt-1">
                Sube un partido de baloncesto y generaremos un clip por cada posesión.
              </p>
            )}
          </div>
        </div>

        {/* Context banner when coming from a match */}
        {returnTo && (
          <Alert className="border-blue-200 bg-blue-50 text-blue-900">
            <Info className="h-4 w-4 shrink-0 text-blue-600" />
            <AlertDescription>
              {opponent
                ? `Subiendo vídeo para el partido contra ${opponent}. Al completar, volverás automáticamente al partido.`
                : "Al completar la subida volverás automáticamente a la página de origen."}
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del trabajo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="video-title" className="text-sm font-medium">
                Título <span className="text-destructive">*</span>
              </label>
              <input
                id="video-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isUploading || isProcessing || isDone}
                placeholder="Ej. vs Estudiantes 12-may-2026"
                maxLength={255}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p className="text-xs text-muted-foreground">
                Te ayudará a encontrar este trabajo después en la lista de vídeos.
              </p>
            </div>

            <VideoUploader
              onFile={handleFile}
              disabled={isUploading || isProcessing || isDone}
            />

            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}

            {canStartNew && (
              <Button
                onClick={handleSubmit}
                disabled={!file || !title.trim() || isError}
                className="w-full"
              >
                Procesar vídeo
              </Button>
            )}

            {isUploading && job && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subiendo...</span>
                  <span>
                    {formatBytes(job.uploadedBytes)} / {formatBytes(job.totalBytes)} · {job.uploadPercent}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${job.uploadPercent}%` }}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => void cancel()}
                  className="w-full"
                >
                  Cancelar subida
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {(isProcessing || isDone || isError) && job && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado del procesado</CardTitle>
            </CardHeader>
            <CardContent>
              <ProcessingStatus
                progress={{
                  status: job.processingStatus ?? "pending",
                  progress: job.processingPercent,
                  error_message: job.errorMessage,
                }}
              />
              {isDone && job.videoId && !returnTo && (
                <div className="flex gap-2 mt-4">
                  <Button
                    onClick={() => {
                      const id = job.videoId;
                      clearJob();
                      router.push(`/videos/${id}`);
                    }}
                    className="flex-1"
                  >
                    Ver clips generados
                  </Button>
                  <Button variant="outline" onClick={clearJob}>
                    Subir otro
                  </Button>
                </div>
              )}
              {isDone && returnTo && (
                <p className="text-sm text-muted-foreground mt-4 text-center">
                  Redirigiendo al partido...
                </p>
              )}
              {isError && (
                <Button variant="outline" onClick={clearJob} className="w-full mt-4">
                  Intentar de nuevo
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}

export default function UploadPage() {
  return (
    <Suspense>
      <UploadPageContent />
    </Suspense>
  );
}
