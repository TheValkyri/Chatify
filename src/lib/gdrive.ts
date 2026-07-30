// ─── Google Drive Client API ──────────────────────────────────────────────
// Client-side functions for Google Drive upload (with 100% real XHR progress)
// and URL resolution via server proxy at /api/gdrive-proxy.

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

/**
 * Uploads a file directly to Google Drive via the server streaming route.
 * Uses XHR with real byte-level progress tracking (0-100%).
 * Bypasses browser CORS and Cloudflare RAM limits completely.
 */
export function uploadFileToGDrive(
  file: File,
  onProgress?: (progress: GDriveUploadProgress) => void,
): Promise<GDriveUploadResult> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/gdrive-upload");

    const mimeType = file.type || "application/octet-stream";
    xhr.setRequestHeader("Content-Type", mimeType);
    xhr.setRequestHeader("x-file-name", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-file-size", file.size.toString());

    // 100% Real upload progress (client -> server -> Google Drive stream)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) {
        const percent = Math.min(Math.round((e.loaded / e.total) * 99), 99);
        onProgress({ loaded: e.loaded, total: e.total, percent });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (onProgress) {
          onProgress({ loaded: file.size, total: file.size, percent: 100 });
        }
        try {
          const res = JSON.parse(xhr.responseText) as GDriveUploadResult & { error?: string };
          if (res.error) {
            reject(new Error(res.error));
            return;
          }
          resolve(res);
        } catch {
          reject(new Error("Không thể phân tích phản hồi từ server."));
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText) as { error?: string };
          reject(new Error(res.error || `Tải tệp lên thất bại (${xhr.status})`));
        } catch {
          reject(new Error(`Tải tệp lên thất bại (${xhr.status}): ${xhr.responseText}`));
        }
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải tệp lên server."));
    xhr.ontimeout = () => reject(new Error("Hết thời gian chờ khi tải tệp lên server."));

    xhr.send(file);
  });
}

/**
 * Returns a proxy URL for viewing/streaming a Google Drive file.
 * Supports HTTP 206 Range Requests for video/audio seeking.
 */
export function getGDriveProxyUrl(fileId: string): string {
  return `/api/gdrive-proxy?id=${encodeURIComponent(fileId)}`;
}

/**
 * Returns a proxy URL for downloading a Google Drive file.
 * Sets Content-Disposition: attachment for direct native download.
 */
export function getGDriveDownloadUrl(fileId: string, fileName?: string): string {
  let url = `/api/gdrive-proxy?id=${encodeURIComponent(fileId)}&download=true`;
  if (fileName) url += `&name=${encodeURIComponent(fileName)}`;
  return url;
}

/**
 * Returns direct proxy URL for viewing media.
 */
export function getGDriveDirectUrl(fileId: string, _mimeType?: string): string {
  return getGDriveProxyUrl(fileId);
}
