/**
 * Mirrors backend app/models/video.py VideoStatus enum.
 */
export type VideoStatus =
  | "uploading"
  | "pending"
  | "processing"
  | "completed"
  | "invalid"
  | "error";

export interface Video {
  id: number;
  user_id: number;
  /** Etiqueta legible añadida por el usuario al subir. Null en filas antiguas. */
  title: string | null;
  filename: string;
  s3_key: string;
  status: VideoStatus;
  error_message: string | null;
  created_at: string;
}

/** Item del listado /videos: incluye el conteo de clips ya generados. */
export interface VideoListItem {
  id: number;
  title: string | null;
  filename: string;
  status: VideoStatus;
  error_message: string | null;
  clips_count: number;
  created_at: string;
}

export interface ProcessingJob {
  id: number;
  status: VideoStatus;
  progress: number | null;
  error_message: string | null;
  created_at: string;
}

export interface ProcessingProgress {
  status: VideoStatus;
  progress: number;
  error_message: string | null;
}

// ── Multipart upload contracts ────────────────────────────────────────────────

export interface PresignedPart {
  part_number: number;
  url: string;
}

export interface InitUploadResponse {
  video_id: number;
  upload_id: string;
  s3_key: string;
  part_size: number;
  total_parts: number;
  urls: PresignedPart[];
}

export interface UploadedPart {
  part_number: number;
  etag: string;
}

export interface UploadStatusResponse {
  video_id: number;
  upload_id: string | null;
  s3_key: string;
  status: VideoStatus;
  uploaded_parts: UploadedPart[];
}
