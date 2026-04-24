import type {
  ProcessingJob,
  ProcessingProgress,
  VideoUploadResponse,
} from "../types";
import { WS_BASE_URL, apiRequest } from "./client";

// ── REST endpoints ────────────────────────────────────────────────────────────

/**
 * POST /videos/upload
 *
 * Uploads a video file and enqueues it for processing.
 * Returns immediately with status "pending" — use `getVideoStatus` or
 * `subscribeToProgress` to track progress.
 */
export async function uploadVideo(
  file: File,
  token: string,
): Promise<VideoUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest<VideoUploadResponse>("/videos/upload", {
    method: "POST",
    body: formData,
    token,
  });
}

/**
 * GET /videos/{videoId}/status
 *
 * Polls the current processing status.  The `progress` field is sourced from
 * Redis and may be more up-to-date than the `status` field from the database.
 */
export async function getVideoStatus(
  videoId: number,
  token: string,
): Promise<ProcessingJob> {
  return apiRequest<ProcessingJob>(`/videos/${videoId}/status`, { token });
}

// ── WebSocket subscription ────────────────────────────────────────────────────

/** Statuses that mark the end of the pipeline — no more messages will arrive. */
const TERMINAL_STATUSES = new Set(["completed", "invalid", "error"]);

export interface ProgressSubscription {
  /** Call this to close the WebSocket before a terminal status is received. */
  unsubscribe: () => void;
}

/**
 * Opens a WebSocket to WS /ws/{videoId} and calls the supplied callbacks
 * as the Celery worker pushes progress updates.
 *
 * The connection is closed automatically once a terminal status is received
 * ("completed", "invalid", or "error").  You can also close it early by
 * calling `subscription.unsubscribe()`.
 *
 * @param videoId   - ID returned by `uploadVideo`
 * @param onProgress - called for every progress message
 * @param onDone     - called once after the terminal message is delivered
 * @param onError    - called if the WebSocket itself errors
 *
 * @returns `{ unsubscribe }` — call it to cancel the subscription early
 *
 * @example
 * ```ts
 * const sub = subscribeToProgress(
 *   videoId,
 *   (p) => setProgress(p.progress),
 *   ()  => router.push("/clips"),
 *   (e) => console.error("WS error", e),
 * );
 * // Later, if the user navigates away:
 * sub.unsubscribe();
 * ```
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
      // Ignore malformed frames — the server should never send these
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
