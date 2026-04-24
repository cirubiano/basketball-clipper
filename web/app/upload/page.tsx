"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  subscribeToProgress,
  uploadVideoMultipart,
  type UploadController,
  type UploadProgress,
} from "@basketball-clipper/shared/api";
import type { ProcessingProgress } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoUploader } from "@/components/video/VideoUploader";
import { ProcessingStatus } from "@/components/video/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredToken } from "@/lib/auth";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const uploadCtrlRef = useRef<UploadController | null>(null);

  useEffect(() => {
    return () => {
      unsubRef.current?.();
    };
  }, []);

  const handleFile = useCallback((f: File) => {
    setFile(f);
    setUploadError(null);
  }, []);

  async function handleSubmit() {
    if (!file) return;
    const token = getStoredToken();
    if (!token) return;

    setStage("uploading");
    setUploadError(null);
    setUploadProgress(null);

    try {
      // Subida directa a S3/MinIO en chunks con progreso y reintentos
      const ctrl = uploadVideoMultipart(file, {
        token,
        onProgress: (p) => setUploadProgress(p),
      });
      uploadCtrlRef.current = ctrl;

      const job = await ctrl.done;
      uploadCtrlRef.current = null;

      setStage("processing");

      const sub = subscribeToProgress(
        job.id,
        (p) => {
          setProgress(p);
          if (p.status === "completed") setStage("done");
          if (p.status === "invalid" || p.status === "error") setStage("error");
        },
        () => setStage("done"),
        (err) => {
          console.error("WS error", err);
          setStage("error");
          setProgress((prev) =>
            prev ? { ...prev, status: "error", error_message: "Error de conexión." } : null
          );
        }
      );
      unsubRef.current = sub.unsubscribe;
    } catch (err) {
      setStage("error");
      setUploadError(err instanceof Error ? err.message : "Error al subir el vídeo.");
    }
  }

  async function handleCancelUpload() {
    if (!uploadCtrlRef.current) return;
    await uploadCtrlRef.current.abort();
    uploadCtrlRef.current = null;
    setStage("idle");
    setUploadProgress(null);
    setFile(null);
  }

  function handleViewClips() {
    unsubRef.current?.();
    router.push("/clips");
  }

  const isProcessing = stage === "uploading" || stage === "processing";

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
            <CardTitle className="text-base">Seleccionar archivo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <VideoUploader onFile={handleFile} disabled={isProcessing || stage === "done"} />

            {uploadError && (
              <p className="text-sm text-destructive">{uploadError}</p>
            )}

            {(stage === "idle" || stage === "error") && (
              <Button
                onClick={handleSubmit}
                disabled={!file || stage === "error"}
                className="w-full"
              >
                Procesar vídeo
              </Button>
            )}

            {stage === "uploading" && uploadProgress && (
              <div className="space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Subiendo parte {uploadProgress.uploadedParts}/{uploadProgress.totalParts}
                  </span>
                  <span>
                    {formatBytes(uploadProgress.uploadedBytes)} /{" "}
                    {formatBytes(uploadProgress.totalBytes)} · {uploadProgress.percent}%
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={handleCancelUpload}
                  className="w-full"
                >
                  Cancelar subida
                </Button>
              </div>
            )}

            {stage === "uploading" && !uploadProgress && (
              <p className="text-center text-sm text-muted-foreground animate-pulse">
                Iniciando subida...
              </p>
            )}
          </CardContent>
        </Card>

        {(stage === "processing" || stage === "done" || stage === "error") && progress && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estado del procesado</CardTitle>
            </CardHeader>
            <CardContent>
              <ProcessingStatus progress={progress} />
              {stage === "done" && (
                <Button onClick={handleViewClips} className="w-full mt-4">
                  Ver mis clips
                </Button>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </PageShell>
  );
}
