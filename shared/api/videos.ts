import type {
  InitUploadResponse,
  ProcessingJob,
  ProcessingProgress,
  UploadStatusResponse,
  UploadedPart,
} from "../types";
import { WS_BASE_URL, apiRequest } from "./client";

// ── Multipart upload endpoints ───────────────────────────────────────────────

/**
 * POST /videos/init-upload
 * Crea la fila Video y devuelve el plan de multipart upload: upload_id,
 * tamaño de parte, y una URL pre-firmada por cada parte para que el
 * navegador haga PUT directo al storage.
 */
export async function initUpload(
  input: { filename: string; size: number; contentType?: string },
  token: string,
): Promise<InitUploadResponse> {
  return apiRequest<InitUploadResponse>("/videos/init-upload", {
    method: "POST",
    body: JSON.stringify({
      filename: input.filename,
      size: input.size,
      content_type: input.contentType ?? "video/mp4",
    }),
    token,
  });
}

/** GET /videos/{id}/upload-status — lista partes ya confirmadas en S3. */
export async function getUploadStatus(
  videoId: number,
  token: string,
): Promise<UploadStatusResponse> {
  return apiRequest<UploadStatusResponse>(
    `/videos/${videoId}/upload-status`,
    { token },
  );
}

/**
 * POST /videos/{id}/complete-upload
 * Cierra el multipart upload en S3 y encola el procesado.
 */
export async function completeUpload(
  videoId: number,
  parts: UploadedPart[],
  token: string,
): Promise<ProcessingJob> {
  return apiRequest<ProcessingJob>(`/videos/${videoId}/complete-upload`, {
    method: "POST",
    body: JSON.stringify({ parts }),
    token,
  });
}

/** POST /videos/{id}/abort-upload — cancela un upload en curso. */
export async function abortUpload(
  videoId: number,
  token: string,
): Promise<void> {
  await apiRequest<void>(`/videos/${videoId}/abort-upload`, {
    method: "POST",
    token,
  });
}

// ── Processing status ────────────────────────────────────────────────────────

/**
 * GET /videos/{id}/status
 * Polling del estado. `progress` viene de Redis y puede estar más
 * actualizado que `status` de la BD.
 */
export async function getVideoStatus(
  videoId: number,
  token: string,
): Promise<ProcessingJob> {
  return apiRequest<ProcessingJob>(`/videos/${videoId}/status`, { token });
}

// ── WebSocket subscription ───────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "invalid", "error"]);

export interface ProgressSubscription {
  unsubscribe: () => void;
}

/**
 * Abre un WebSocket a /ws/{videoId} y dispara callbacks a medida que el
 * worker publica progreso. La conexión se cierra sola al llegar a un
 * estado terminal ("completed", "invalid", "error").
 */
export function subscribeToProgress(
  videoId: number,
  onProgress: (progress: ProcessingProgress) => void,
  onDone?: () => void,
  onError?: (event: Event) => void,
): ProgressSubscription {
  const ws = new WebSocket(`${WS_BASE_URL}/ws/${videoId}`);

  ws.onmessage = (event: MessageEvent<string>) => {
    let data: ProcessingProgress;
    try {
      data = JSON.parse(event.data) as ProcessingProgress;
    } catch {
      return;
    }

    onProgress(data);

    if (TERMINAL_STATUSES.has(data.status)) {
      onDone?.();
      ws.close();
    }
  };

  ws.onerror = (event: Event) => {
    onError?.(event);
  };

  return {
    unsubscribe: () => ws.close(),
  };
}
