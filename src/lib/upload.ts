// ─── Chatify — File Upload ──────────────────────────────────────────────────
// Handles file uploads via Supabase Storage in production mode.
// In demo mode, returns blob URLs directly (files stay in browser memory).

import { IS_DEMO_MODE, SUPABASE_URL, SUPABASE_ANON_KEY } from "./config";
import { getSupabase } from "./supabase";
import type { Attachment } from "./types";
import { uploadFileToGDrive, getGDriveDirectUrl } from "./gdrive";

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
 * Production: uploads to Google Drive 5TB storage (fallback: Supabase Storage).
 */
export async function uploadFile(
  file: File,
  conversationId: string = "profile",
  onProgress?: (progress: UploadProgress) => void,
): Promise<UploadResult> {
  const MAX_SIZE_MB = 5000; // 5 GB
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
  if (file.size > MAX_SIZE_BYTES) {
    throw new Error(
      `Tệp "${file.name}" (${formatSize(file.size)}) vượt quá dung lượng cho phép (Tối đa 5 GB).`,
    );
  }

  const id = crypto.randomUUID();

  if (IS_DEMO_MODE) {
    // Simulate upload delay with real progress for realistic UX
    if (onProgress) {
      for (let i = 0; i <= 100; i += 20) {
        await new Promise((r) => setTimeout(r, 60));
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

  // Primary: Upload directly to Google Drive 5TB Storage
  try {
    const gdriveRes = await uploadFileToGDrive(file, onProgress);
    return {
      id: gdriveRes.id,
      url: gdriveRes.url, // "gdrive://<file_id>"
      thumbnailUrl: file.type.startsWith("image/")
        ? getGDriveDirectUrl(gdriveRes.id, file.type)
        : undefined,
      name: gdriveRes.name,
      size: gdriveRes.size,
      contentType: gdriveRes.mimeType,
    };
  } catch (gdriveErr) {
    console.error("Google Drive upload error:", gdriveErr);
    // If file is > 50MB, Supabase will definitely fail, so throw Google Drive error directly
    if (file.size > 50 * 1024 * 1024) {
      throw new Error(
        gdriveErr instanceof Error
          ? gdriveErr.message
          : "Không thể tải tệp lên kho Google Drive. Vui lòng thử lại.",
      );
    }
    console.warn("Falling back to Supabase Storage for small file:", gdriveErr);
  }

  // Fallback: upload to Supabase Storage with real XHR progress tracking
  const supabase = getSupabase();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${conversationId}/${id}.${ext}`;

  if (onProgress) {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes.data.session?.access_token || SUPABASE_ANON_KEY!;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/attachments/${path}`;

    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadUrl);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY!);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.round((e.loaded / e.total) * 100);
          onProgress({ loaded: e.loaded, total: e.total, percent });
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress({ loaded: file.size, total: file.size, percent: 100 });
          resolve({
            id,
            url: path,
            thumbnailUrl: file.type.startsWith("image/") ? path : undefined,
            name: file.name,
            size: file.size,
            contentType: file.type,
          });
        } else if (xhr.status === 413 || xhr.responseText.includes("Payload too large")) {
          reject(
            new Error(
              `Tệp vượt quá dung lượng tối đa cho phép trên Supabase. Vui lòng chọn tệp nhỏ hơn.`,
            ),
          );
        } else {
          reject(new Error(`Tải tệp thất bại (${xhr.status}): ${xhr.responseText}`));
        }
      };

      xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải tệp lên server."));
      xhr.send(file);
    });
  }

  const { error } = await supabase.storage.from("attachments").upload(path, file, {
    contentType: file.type,
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw new Error(`Upload failed: ${error.message}`);

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
 * Creates a temporary signed URL or resolves direct Google Drive URL for an attachment.
 */
export async function getAttachmentSignedUrl(path: string, expiresInSec = 3600): Promise<string> {
  if (IS_DEMO_MODE) return path; // demo mode: path đã là blob: URL sẵn, dùng thẳng
  if (path.startsWith("gdrive://")) {
    const fileId = path.replace("gdrive://", "");
    return getGDriveDirectUrl(fileId);
  }
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
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
      duration: "Video",
      url: upload.url,
      thumbnailUrl: upload.thumbnailUrl,
    };
  }

  if (file.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)) {
    return {
      kind: "audio",
      id: upload.id,
      name: upload.name,
      size: sizeStr,
      duration: "Audio",
      url: upload.url,
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
