import { useState, useEffect, useCallback } from "react";
import { getAttachmentSignedUrl } from "@/lib/upload";
import { getGDriveDirectUrl } from "@/lib/gdrive";

const signedUrlCache = new Map<string, { url: string; expires: number }>();

/**
 * Invalidate a cached signed URL so it will be re-signed on next render.
 */
export function invalidateSignedUrl(path: string): void {
  signedUrlCache.delete(path);
}

/**
 * Resolve a gdrive:// path to a direct media URL.
 * Uses lh3 CDN for images and export=download for videos/audio.
 */
function resolveGDrivePath(path: string, mimeTypeOrKind?: string): string {
  const fileId = path.replace("gdrive://", "");
  return getGDriveDirectUrl(fileId, mimeTypeOrKind);
}

/**
 * React hook to resolve attachment paths to displayable URLs.
 *
 * Handles:
 * - blob: / data: / http: / https: → returned as-is
 * - gdrive://{fileId} → resolved synchronously to direct media stream URL
 * - Supabase storage paths → async signed URL via getAttachmentSignedUrl
 *
 * Returns a `refresh` callback to force re-signing.
 */
export function useAttachmentUrl(
  path: string | undefined | null,
  mimeTypeOrKind?: string,
): {
  url: string;
  refresh: () => void;
} {
  const [url, setUrl] = useState<string>(() => {
    if (!path) return "";
    if (
      path.startsWith("blob:") ||
      path.startsWith("data:") ||
      path.startsWith("http:") ||
      path.startsWith("https:")
    ) {
      return path;
    }
    if (path.startsWith("gdrive://")) {
      return resolveGDrivePath(path, mimeTypeOrKind);
    }
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
    if (
      path.startsWith("blob:") ||
      path.startsWith("data:") ||
      path.startsWith("http:") ||
      path.startsWith("https:")
    ) {
      setUrl(path);
      return;
    }
    if (path.startsWith("gdrive://")) {
      setUrl(resolveGDrivePath(path, mimeTypeOrKind));
      return;
    }

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
  }, [path, mimeTypeOrKind, retryCount]);

  return { url, refresh };
}
