/**
 * Mirrors backend app/models/video.py VideoStatus enum.
 * Order reflects the processing pipeline progression.
 */
export type VideoStatus =
  | "pending"     // uploaded, not yet picked up by worker
  | "validating"  // Claude Vision API is checking it's a basketball game
  | "processing"  // YOLOv8 detection + FFmpeg cutting in progress
  | "completed"   // all clips are ready
  | "invalid"     // rejected — not a basketball game
  | "error";      // unhandled pipeline failure

/**
 * Full video entity as stored in the database.
 * Field names are snake_case to exactly match the JSON FastAPI returns.
 */
export interface Video {
  id: number;
  user_id: number;
  filename: string;
  s3_key: string;
  status: VideoStatus;
  /** Set by the worker if validation or processing fails. */
  error_message: string | null;
  created_at: string; // ISO 8601
}

/**
 * Response from POST /videos/upload.
 * Minimal — just enough to start polling or open a WebSocket.
 */
export interface VideoUploadResponse {
  id: number;
  status: VideoStatus;
  message: string;
}

/**
 * Response from GET /videos/{id}/status.
 * Mirrors backend app/schemas/video.py VideoStatusResponse.
 */
export interface ProcessingJob {
  id: number;
  status: VideoStatus;
  /** 0–100, sourced from Redis; null if not yet available. */
  progress: number | null;
  error_message: string | null;
  created_at: string;
}

/**
 * Payload pushed over the WebSocket channel ws/video:{id}.
 * Published by the Celery worker after every pipeline stage.
 */
export interface ProcessingProgress {
  status: VideoStatus;
  /** Always 0–100 in WebSocket messages. */
  progress: number;
  error_message: string | null;
}
