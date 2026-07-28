// ─── Chatify — File Upload ──────────────────────────────────────────────────
// Handles file uploads via Supabase Storage in production mode.
// In demo mode, returns blob URLs directly (files stay in browser memory).

import { IS_DEMO_MODE } from "./config";
import { getSupabase } from "./supabase";
import type { Attachment } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export type UploadResult = {
  id: string;
  url: string;
  thumbnailUrl?: string;
  name: string;
  size: number;
  contentType: string;
};

export type UploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

// ─── Upload Single File ─────────────────────────────────────────────────────

/**
 * Upload a file and return its permanent URL.
 * Demo: returns a blob URL (lost after page refresh — acceptable for demo).
 * Production: uploads to Supabase Storage bucket "attachments".
 */
export async function uploadFile(
  file: File,
  conversationId: string = "profile",
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  const id = crypto.randomUUID();

  if (IS_DEMO_MODE) {
    // Simulate upload delay for realistic UX
    if (onProgress) {
      for (let i = 0; i <= 100; i += 25) {
        await new Promise((r) => setTimeout(r, 80));
        onProgress({ loaded: (file.size * i) / 100, total: file.size, percent: i });
      }
    }

    const url = URL.createObjectURL(file);
    return {
      id,
      url,
      thumbnailUrl:
        file.type.startsWith("image/") || file.type.startsWith("video/") ? url : undefined,
      name: file.name,
      size: file.size,
      contentType: file.type,
    };
  }

  // Production: upload to Supabase Storage
  const supabase = getSupabase();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${conversationId}/${id}.${ext}`;

  const { error } = await supabase.storage.from("attachments").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

  if (onProgress) {
    onProgress({ loaded: file.size, total: file.size, percent: 100 });
  }

  return {
    id,
    url: path,
    thumbnailUrl: file.type.startsWith("image/") ? path : undefined,
    name: file.name,
    size: file.size,
    contentType: file.type,
  };
}

/**
 * Creates a temporary signed URL for an attachment stored via its path.
 */
export async function getAttachmentSignedUrl(path: string, expiresInSec = 3600): Promise<string> {
  if (IS_DEMO_MODE) return path; // demo mode: path đã là blob: URL sẵn, dùng thẳng
  const supabase = getSupabase();
  const { data, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(path, expiresInSec);
  if (error) throw new Error(`Không thể tạo link tải: ${error.message}`);
  return data.signedUrl;
}

// ─── Build Attachment from Upload ───────────────────────────────────────────

/**
 * Convert an uploaded file result into a typed Attachment for message sending.
 */
export function buildAttachment(upload: UploadResult, file: File): Attachment {
  const sizeStr = formatSize(upload.size);

  // NOTE: Never include client-only fields (source, sourceFiles, uploadProgress)
  // in the returned object — these would be serialized into JSONB in Postgres.

  if (file.type.startsWith("image/")) {
    return {
      kind: "image",
      id: upload.id,
      name: upload.name,
      size: sizeStr,
      dims: "gốc",
      url: upload.url,
      thumbnailUrl: upload.thumbnailUrl,
    };
  }

  if (file.type.startsWith("video/")) {
    return {
      kind: "video",
      id: upload.id,
      name: upload.name,
      size: sizeStr,
      duration: "—",
      url: upload.url,
      thumbnailUrl: upload.thumbnailUrl,
    };
  }

  return {
    kind: "file",
    id: upload.id,
    name: upload.name,
    size: sizeStr,
    ext: upload.name.split(".").pop() ?? "file",
    url: upload.url,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
