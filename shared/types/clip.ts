/**
 * Possession and timing metadata for a single clip.
 * Times are in seconds from the start of the source video.
 *
 * Field names are snake_case to exactly match the JSON FastAPI returns.
 */
export interface ClipMetadata {
  /** Seconds from the start of the source video. */
  start_time: number;
  /** Seconds from the start of the source video. */
  end_time: number;
  /** end_time − start_time, stored for fast sorting. */
  duration: number;
  /**
   * Colour-cluster label assigned by the detector.
   * Either "team_a" or "team_b" — specific colours are resolved
   * per-video during detection.
   */
  team: string | null;
}

/**
 * Full clip entity as returned by GET /clips and GET /clips/{id}.
 * Mirrors backend app/schemas/clip.py ClipResponse.
 */
export interface Clip extends ClipMetadata {
  id: number;
  video_id: number;
  s3_key: string;
  /** Pre-signed S3 GET URL. Valid for 1 hour from the time of the request. */
  url: string;
  created_at: string; // ISO 8601
}
