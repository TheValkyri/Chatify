// ─── Google Drive File Proxy API Route ─────────────────────────────────────
// GET /api/gdrive-proxy?id={fileId}&download=true&name={filename}
// Proxies file content from Google Drive API (using OAuth2 access token).
// Supports HTTP 206 Range Requests for video seeking in <video> elements.
// Used for both video/audio preview streaming AND direct file downloads.

import {
  defineEventHandler,
  getQuery,
  getRequestHeader,
  setResponseHeader,
  setResponseStatus,
  createError,
  sendStream,
} from "h3";
import { getGoogleDriveAccessToken } from "../utils/gdrive-auth";

export default defineEventHandler(async (event) => {
  const query = getQuery(event) as {
    id?: string;
    download?: string;
    name?: string;
  };

  if (!query.id) {
    throw createError({ statusCode: 400, statusMessage: "Missing file ID" });
  }

  const token = await getGoogleDriveAccessToken();
  const gdriveUrl = `https://www.googleapis.com/drive/v3/files/${query.id}?alt=media`;

  // Forward Range header for video seeking (HTTP 206 Partial Content)
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  const rangeHeader = getRequestHeader(event, "range");
  if (rangeHeader) {
    headers["Range"] = rangeHeader;
  }

  const response = await fetch(gdriveUrl, { headers });

  if (!response.ok && response.status !== 206) {
    throw createError({
      statusCode: response.status,
      statusMessage: `Google Drive file fetch failed (${response.status})`,
    });
  }

  // Mirror the response status (200 for full, 206 for partial/range)
  setResponseStatus(event, response.status);

  // Forward essential content headers
  const contentType = response.headers.get("Content-Type");
  if (contentType) setResponseHeader(event, "Content-Type", contentType);

  const contentLength = response.headers.get("Content-Length");
  if (contentLength) setResponseHeader(event, "Content-Length", contentLength);

  const contentRange = response.headers.get("Content-Range");
  if (contentRange) setResponseHeader(event, "Content-Range", contentRange);

  // Always advertise range support for media players
  setResponseHeader(event, "Accept-Ranges", "bytes");

  // Set download disposition if requested
  if (query.download === "true" && query.name) {
    setResponseHeader(
      event,
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(query.name)}"`,
    );
  } else {
    // Inline display for previews
    setResponseHeader(event, "Content-Disposition", "inline");
  }

  // Allow browser caching for 1 hour
  setResponseHeader(event, "Cache-Control", "public, max-age=3600");

  // Stream the response body directly (no buffering for large files)
  if (response.body) {
    return sendStream(event, response.body as ReadableStream);
  }

  // Fallback for environments without streaming support
  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
});
