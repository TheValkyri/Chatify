// ─── Google Drive Client API ──────────────────────────────────────────────
// Client-side functions for Google Drive upload (with real XHR progress)
// and URL resolution via server-side proxy at /api/gdrive-proxy.

export type GDriveUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
};

export type GDriveUploadResult = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  url: string;
};

// ─── Upload File with Real Progress ─────────────────────────────────────────

/**
 * Uploads a file to Google Drive via the server-side API route.
 * Uses XMLHttpRequest for real byte-level upload progress tracking.
 *
 * Progress phases:
 * - 0-95%: Real upload progress (client → server, tracked by XHR)
 * - 95-100%: Server processing (Google Drive API upload + permission set)
 */
export function uploadFileToGDrive(
  file: File,
  onProgress?: (progress: GDriveUploadProgress) => void,
): Promise<GDriveUploadResult> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/gdrive-upload");

    // Real upload progress tracking (client → server transfer)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        // Reserve last 5% for server-side Google Drive processing
        const percent = Math.min(Math.round((e.loaded / e.total) * 95), 95);
        onProgress({ loaded: e.loaded, total: e.total, percent });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) {
          onProgress({ loaded: file.size, total: file.size, percent: 100 });
        }
        try {
          const result = JSON.parse(xhr.responseText) as GDriveUploadResult;
          resolve(result);
        } catch {
          reject(new Error("Không thể phân tích phản hồi từ server."));
        }
      } else {
        reject(new Error(`Tải tệp lên thất bại (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải tệp lên server."));
    xhr.ontimeout = () => reject(new Error("Hết thời gian chờ khi tải tệp lên server."));

    xhr.send(formData);
  });
}

// ─── URL Resolution via Server Proxy ────────────────────────────────────────

/**
 * Returns a proxy URL for viewing/streaming a Google Drive file.
 * Supports HTTP 206 Range Requests for video/audio seeking.
 */
export function getGDriveProxyUrl(fileId: string): string {
  return `/api/gdrive-proxy?id=${encodeURIComponent(fileId)}`;
}

/**
 * Returns a proxy URL for downloading a Google Drive file.
 * Sets Content-Disposition: attachment for browser download dialog.
 */
export function getGDriveDownloadUrl(fileId: string, fileName?: string): string {
  let url = `/api/gdrive-proxy?id=${encodeURIComponent(fileId)}&download=true`;
  if (fileName) url += `&name=${encodeURIComponent(fileName)}`;
  return url;
}

/**
 * Legacy helper: Returns a proxy URL for direct viewing.
 * Used by getAttachmentSignedUrl for backward compatibility.
 */
export function getGDriveDirectUrl(fileId: string, _mimeType?: string): string {
  return getGDriveProxyUrl(fileId);
}
