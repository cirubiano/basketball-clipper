/**
 * Mirrors backend app/models/video.py VideoStatus enum.
 * Order reflects the processing pipeline progression.
 */
export type VideoStatus =
  | "uploading"   // multipart upload in progress
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
 * GET /videos/{id}/status response.
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
  progress: number;
  error_message: string | null;
}

// ── Multipart upload contracts ────────────────────────────────────────────────

/** URL pre-firmada para subir UNA parte del multipart upload. */
export interface PresignedPart {
  part_number: number;
  url: string;
}

/** Respuesta de POST /videos/init-upload. */
export interface InitUploadResponse {
  video_id: number;
  upload_id: string;
  s3_key: string;
  part_size: number;
  total_parts: number;
  urls: PresignedPart[];
}

/** Parte ya subida, enviada a complete-upload o devuelta por upload-status. */
export interface UploadedPart {
  part_number: number;
  etag: string;
}

/** GET /videos/{id}/upload-status — usado para reanudar uploads. */
export interface UploadStatusResponse {
  video_id: number;
  upload_id: string | null;
  s3_key: string;
  status: VideoStatus;
  uploaded_parts: UploadedPart[];
}
