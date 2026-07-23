import { useState, useEffect, useCallback } from "react";
import { getAttachmentSignedUrl } from "@/lib/upload";
import { IS_DEMO_MODE } from "@/lib/config";

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
 * React hook to sign and cache a Supabase Storage path.
 * If the path is already a blob URL or web URL, returns it immediately.
 * Returns a `refresh` callback to force re-signing (e.g. on img/video error).
 */
export function useAttachmentUrl(path: string | undefined | null): {
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
