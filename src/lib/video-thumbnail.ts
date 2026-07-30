// ─── Video Thumbnail Generator ──────────────────────────────────────────────
// Extracts a crisp highlight frame (poster image) from a video file or URL.
// Used for chat video cards and hover scrubbing previews.

/**
 * Generates a thumbnail image (data URI JPEG) from a video file or URL.
 * Seeks to `seekTimeSec` (default 2 seconds or 25% into the video) to capture a highlight frame.
 */
export function generateVideoThumbnail(source: File | string, seekTimeSec = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    // If running server-side (SSR), return empty string
    if (typeof window === "undefined") {
      resolve("");
      return;
    }

    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";

    const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);
    video.src = objectUrl;

    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      if (typeof source !== "string") {
        URL.revokeObjectURL(objectUrl);
      }
    };

    // Timeout safety (3 seconds max)
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error("Hết thời gian chờ tạo ảnh thu nhỏ video."));
    }, 4000);

    video.onloadedmetadata = () => {
      // Seek to 2s or 25% of duration, whichever is shorter/available
      const targetTime =
        video.duration && !isNaN(video.duration)
          ? Math.min(seekTimeSec, video.duration * 0.25 || 1)
          : seekTimeSec;
      video.currentTime = targetTime;
    };

    video.onseeked = () => {
      window.clearTimeout(timeoutId);
      try {
        const canvas = document.createElement("canvas");
        // Limit max thumbnail dimensions to 640x360 for fast performance
        const maxW = 640;
        const maxH = 360;
        let w = video.videoWidth || 640;
        let h = video.videoHeight || 360;

        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }
        if (h > maxH) {
          w = Math.round((w * maxH) / h);
          h = maxH;
        }

        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, w, h);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          cleanup();
          resolve(dataUrl);
        } else {
          cleanup();
          reject(new Error("Không thể khởi tạo canvas context."));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    };

    video.onerror = (err) => {
      window.clearTimeout(timeoutId);
      cleanup();
      reject(err);
    };
  });
}
