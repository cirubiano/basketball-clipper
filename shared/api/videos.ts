import type {
  Clip,
  InitUploadResponse,
  ProcessingJob,
  ProcessingProgress,
  UploadStatusResponse,
  UploadedPart,
  VideoListItem,
} from "../types";
import { WS_BASE_URL, apiRequest } from "./client";

// ── Multipart upload endpoints ───────────────────────────────────────────────

export async function initUpload(
  input: {
    title: string;
    filename: string;
    size: number;
    contentType?: string;
  },
  token: string,
): Promise<InitUploadResponse> {
  return apiRequest<InitUploadResponse>("/videos/init-upload", {
    method: "POST",
    body: JSON.stringify({
      title: input.title,
      filename: input.filename,
      size: input.size,
      content_type: input.contentType ?? "video/mp4",
    }),
    token,
  });
}

export async function getUploadStatus(
  videoId: number,
  token: string,
): Promise<UploadStatusResponse> {
  return apiRequest<UploadStatusResponse>(
    `/videos/${videoId}/upload-status`,
    { token },
  );
}

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

export async function abortUpload(
  videoId: number,
  token: string,
): Promise<void> {
  await apiRequest<void>(`/videos/${videoId}/abort-upload`, {
    method: "POST",
    token,
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

/** GET /videos — listado de trabajos del usuario, más recientes primero. */
export async function listVideos(token: string): Promise<VideoListItem[]> {
  return apiRequest<VideoListItem[]>("/videos", { token });
}

/** GET /videos/{id}/status — estado actual del procesado. */
export async function getVideoStatus(
  videoId: number,
  token: string,
): Promise<ProcessingJob> {
  return apiRequest<ProcessingJob>(`/videos/${videoId}/status`, { token });
}

/** GET /videos/{id}/clips — clips generados a partir de este vídeo. */
export async function listVideoClips(
  videoId: number,
  token: string,
): Promise<Clip[]> {
  return apiRequest<Clip[]>(`/videos/${videoId}/clips`, { token });
}

/** POST /videos/{id}/retry — re-encola el pipeline si está en error/invalid. */
export async function retryVideo(
  videoId: number,
  token: string,
): Promise<ProcessingJob> {
  return apiRequest<ProcessingJob>(`/videos/${videoId}/retry`, {
    method: "POST",
    token,
  });
}

/** DELETE /videos/{id} — borra vídeo, clips y ficheros físicos en S3. */
export async function deleteVideo(
  videoId: number,
  token: string,
): Promise<void> {
  await apiRequest<void>(`/videos/${videoId}`, { method: "DELETE", token });
}

// ── WebSocket subscription ───────────────────────────────────────────────────

const TERMINAL_STATUSES = new Set(["completed", "invalid", "error"]);

export interface ProgressSubscription {
  unsubscribe: () => void;
}

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
