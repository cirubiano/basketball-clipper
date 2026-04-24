"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "@/components/layout/PageShell";
import { VideoUploader } from "@/components/video/VideoUploader";
import { ProcessingStatus } from "@/components/video/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredToken } from "@/lib/auth";
import { useUploadJob } from "@/lib/uploadJob";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function UploadPage() {
  const router = useRouter();
  const { job, startUpload, cancel, clearJob } = useUploadJob();
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setUploadError(null);
    // Si el usuario aún no ha puesto título, sugerir el nombre del fichero
    // (sin extensión) como placeholder editable.
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

  return (
    <PageShell>
      <div className="max-w-xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Subir vídeo</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sube un partido de baloncesto y generaremos un clip por cada posesión.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Datos del trabajo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Título del vídeo — obligatorio */}
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
              {isDone && job.videoId && (
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
