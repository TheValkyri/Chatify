import { useState, useEffect, useCallback } from "react";
import { getAttachmentSignedUrl } from "@/lib/upload";
import { getGDriveProxyUrl } from "@/lib/gdrive";

const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Invalidate a cached signed URL so it will be re-signed on next render.
 * Call this from an `onError` handler on `<img>` or `<video>` when a
 * signed URL has expired (HTTP 403).
 */
export function invalidateSignedUrl(path: string): void {
  signedUrlCache.delete(path);
}

/**
 * Resolve a gdrive:// path to a proxy URL (synchronous, no async needed).
 */
function resolveGDrivePath(path: string): string {
  const fileId = path.replace("gdrive://", "");
  return getGDriveProxyUrl(fileId);
}

/**
 * React hook to resolve attachment paths to displayable URLs.
 *
 * Handles:
 * - blob: / data: / http: / https: → returned as-is
 * - gdrive://{fileId} → resolved to /api/gdrive-proxy?id={fileId} (synchronous)
 * - Supabase storage paths → async signed URL via getAttachmentSignedUrl
 *
 * Returns a `refresh` callback to force re-signing (e.g. on img/video error).
 */
export function useAttachmentUrl(path: string | undefined | null): {
  url: string;
  refresh: () => void;
} {
  const [url, setUrl] = useState<string>(() => {
    if (!path) return "";
    // Direct URLs: blob, data, http, https
    if (
      path.startsWith("blob:") ||
      path.startsWith("data:") ||
      path.startsWith("http:") ||
      path.startsWith("https:")
    ) {
      return path;
    }
    // Google Drive: resolve to proxy URL immediately (no async needed)
    if (path.startsWith("gdrive://")) {
      return resolveGDrivePath(path);
    }
    // Supabase paths: check cache
    const cached = signedUrlCache.get(path);
    if (cached && cached.expires > Date.now()) {
      return cached.url;
    }
    return "";
  });

  const [retryCount, setRetryCount] = useState(0);

  const refresh = useCallback(() => {
    if (!path) return;
    invalidateSignedUrl(path);
    setRetryCount((c) => c + 1);
  }, [path]);

  useEffect(() => {
    if (!path) {
      setUrl("");
      return;
    }
    // Direct URLs
    if (
      path.startsWith("blob:") ||
      path.startsWith("data:") ||
      path.startsWith("http:") ||
      path.startsWith("https:")
    ) {
      setUrl(path);
      return;
    }
    // Google Drive: resolve synchronously to proxy URL
    if (path.startsWith("gdrive://")) {
      setUrl(resolveGDrivePath(path));
      return;
    }
    // Supabase Storage: check cache then async sign
    const cached = signedUrlCache.get(path);
    if (cached && cached.expires > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let active = true;
    getAttachmentSignedUrl(path)
      .then((signedUrl) => {
        if (active) {
          signedUrlCache.set(path, {
            url: signedUrl,
            expires: Date.now() + 50 * 60 * 1000,
          });
          setUrl(signedUrl);
        }
      })
      .catch((err) => {
        console.error("Failed to sign attachment path:", err);
      });

    return () => {
      active = false;
    };
  }, [path, retryCount]);

  return { url, refresh };
}
