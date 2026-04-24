"use client";

/**
 * Contexto global del "job" de upload + procesado en curso.
 *
 * Permite que el estado sobreviva a la navegación entre páginas del app:
 * si el usuario inicia una subida en /upload y luego va a /clips o /, el
 * WebSocket sigue conectado y el widget flotante (FloatingUploadWidget)
 * muestra el progreso en una esquina.
 *
 * El estado cubre dos fases:
 *   - Subida multipart a MinIO (fase "uploading")
 *   - Procesado en el worker Celery (fase "processing")
 *
 * Cuando el job llega a un estado terminal ("done", "error") se mantiene
 * visible unos segundos para que el usuario vea el resultado, y luego se
 * puede descartar con `clearJob()`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  subscribeToProgress,
  uploadVideoMultipart,
  type ProgressSubscription,
  type UploadController,
  type UploadProgress,
} from "@basketball-clipper/shared/api";
import type {
  ProcessingProgress,
  ProcessingJob,
} from "@basketball-clipper/shared/types";

export type JobStage = "uploading" | "processing" | "done" | "error";

export interface UploadJob {
  videoId: number | null;
  filename: string;
  stage: JobStage;
  /** Progreso de la subida (0–100). Solo relevante en stage "uploading". */
  uploadPercent: number;
  uploadedBytes: number;
  totalBytes: number;
  /** Progreso del worker (0–100). Solo relevante en stage "processing". */
  processingPercent: number;
  /** Estado fino reportado por Redis: "processing", "completed", etc. */
  processingStatus: ProcessingProgress["status"] | null;
  errorMessage: string | null;
}

interface UploadJobApi {
  job: UploadJob | null;
  startUpload: (file: File, title: string, token: string) => Promise<ProcessingJob>;
  cancel: () => Promise<void>;
  clearJob: () => void;
}

const UploadJobContext = createContext<UploadJobApi | null>(null);

const EMPTY_JOB: Omit<UploadJob, "filename"> = {
  videoId: null,
  stage: "uploading",
  uploadPercent: 0,
  uploadedBytes: 0,
  totalBytes: 0,
  processingPercent: 0,
  processingStatus: null,
  errorMessage: null,
};

export function UploadJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<UploadJob | null>(null);
  const uploadCtrlRef = useRef<UploadController | null>(null);
  const wsSubRef = useRef<ProgressSubscription | null>(null);

  // Cierra WS y aborta upload al desmontar (el provider es global; solo se
  // desmonta al cerrar la app/pestaña).
  useEffect(() => {
    return () => {
      wsSubRef.current?.unsubscribe();
      uploadCtrlRef.current?.abort().catch(() => {});
    };
  }, []);

  const updateJob = useCallback((patch: Partial<UploadJob>) => {
    setJob((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const startUpload = useCallback(
    async (file: File, title: string, token: string): Promise<ProcessingJob> => {
      // Si ya había un job activo y cerrado (done/error) el caller debería
      // haber llamado a clearJob primero. Si no, lo limpiamos silenciosamente.
      wsSubRef.current?.unsubscribe();
      uploadCtrlRef.current?.abort().catch(() => {});

      setJob({ ...EMPTY_JOB, filename: file.name, totalBytes: file.size });

      // ── Fase 1: subida multipart ─────────────────────────────────────
      const ctrl = uploadVideoMultipart(file, {
        token,
        title,
        onProgress: (p: UploadProgress) => {
          updateJob({
            uploadPercent: p.percent,
            uploadedBytes: p.uploadedBytes,
            totalBytes: p.totalBytes,
          });
        },
      });
      uploadCtrlRef.current = ctrl;

      let processingJob: ProcessingJob;
      try {
        processingJob = await ctrl.done;
      } catch (err) {
        uploadCtrlRef.current = null;
        updateJob({
          stage: "error",
          errorMessage:
            err instanceof Error ? err.message : "Error durante la subida",
        });
        throw err;
      }
      uploadCtrlRef.current = null;

      updateJob({
        videoId: processingJob.id,
        stage: "processing",
        uploadPercent: 100,
        processingStatus: processingJob.status,
      });

      // ── Fase 2: suscripción al WebSocket del worker ──────────────────
      wsSubRef.current = subscribeToProgress(
        processingJob.id,
        (p) => {
          updateJob({
            processingStatus: p.status,
            processingPercent: p.progress,
            errorMessage: p.error_message,
          });
          if (p.status === "completed") {
            updateJob({ stage: "done" });
          } else if (p.status === "error" || p.status === "invalid") {
            updateJob({ stage: "error" });
          }
        },
        () => {
          // WS cerrado en estado terminal — el stage ya se movió arriba
        },
        () => {
          updateJob({
            stage: "error",
            errorMessage: "Se perdió la conexión con el servidor.",
          });
        },
      );

      return processingJob;
    },
    [updateJob],
  );

  const cancel = useCallback(async () => {
    wsSubRef.current?.unsubscribe();
    wsSubRef.current = null;

    if (uploadCtrlRef.current) {
      await uploadCtrlRef.current.abort();
      uploadCtrlRef.current = null;
    }
    setJob(null);
  }, []);

  const clearJob = useCallback(() => {
    wsSubRef.current?.unsubscribe();
    wsSubRef.current = null;
    uploadCtrlRef.current = null;
    setJob(null);
  }, []);

  const api = useMemo<UploadJobApi>(
    () => ({ job, startUpload, cancel, clearJob }),
    [job, startUpload, cancel, clearJob],
  );

  return (
    <UploadJobContext.Provider value={api}>
      {children}
    </UploadJobContext.Provider>
  );
}

export function useUploadJob(): UploadJobApi {
  const ctx = useContext(UploadJobContext);
  if (!ctx) {
    throw new Error("useUploadJob must be used inside <UploadJobProvider>");
  }
  return ctx;
}
