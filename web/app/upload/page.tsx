"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadVideo, subscribeToProgress } from "@basketball-clipper/shared/api";
import type { ProcessingProgress } from "@basketball-clipper/shared/types";
import { PageShell } from "@/components/layout/PageShell";
import { VideoUploader } from "@/components/video/VideoUploader";
import { ProcessingStatus } from "@/components/video/ProcessingStatus";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStoredToken } from "@/lib/auth";

type Stage = "idle" | "uploading" | "processing" | "done" | "error";

export default function UploadPage() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<Stage>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProcessingProgress | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);

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

    try {
      const { id: video_id } = await uploadVideo(file, token);
      setStage("processing");

      const sub = subscribeToProgress(
        video_id,
        (p) => {
          setProgress(p);
          if (p.status === "completed") {
            setStage("done");
          }
          if (p.status === "invalid" || p.status === "error") {
            setStage("error");
          }
        },
        () => {
          setStage("done");
        },
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

            {stage === "idle" || stage === "error" ? (
              <Button
                onClick={handleSubmit}
                disabled={!file || stage === "error"}
                className="w-full"
              >
                {stage === "uploading" ? "Subiendo..." : "Procesar vídeo"}
              </Button>
            ) : null}

            {stage === "uploading" && (
              <p className="text-center text-sm text-muted-foreground animate-pulse">
                Subiendo vídeo...
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
