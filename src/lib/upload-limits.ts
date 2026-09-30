// Shared by the upload dialog (early, friendly checks) and the server (the checks that count).

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;
export const MAX_UPLOAD_DURATION_MS = 15 * 60 * 1000;

/** Anything the browser labels audio/* or video/*; the presigned PUT is signed for exactly this type. */
export const MEDIA_TYPE = /^(audio|video)\/[\w.+-]+$/;

export function uploadProblem({ size, type, durationMs }: { size: number; type: string; durationMs?: number | null }) {
  if (!MEDIA_TYPE.test(type)) return "Choose an audio or video file (MP4, WebM, MOV, MP3, M4A, WAV…).";
  if (size <= 0) return "That file is empty.";
  if (size > MAX_UPLOAD_BYTES) return "Files can be at most 100 MB.";
  if (durationMs != null && durationMs > MAX_UPLOAD_DURATION_MS) return "Recordings can be at most 15 minutes long.";
  return null;
}
