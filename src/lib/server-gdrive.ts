// ─── Server-side Google Drive API Handler ──────────────────────────────────
// Executed on Cloudflare Workers / Nitro server inside src/server.ts.
// Manages OAuth2 tokens, streams uploads directly to Google Drive Resumable API,
// and proxies media streams (supporting HTTP 206 Range Requests for videos).
//
// CREDENTIALS: Set these as Cloudflare Worker environment variables:
//   GDRIVE_FOLDER_ID, GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN

export let GDRIVE_FOLDER_ID = "";
let OAUTH_CLIENT_ID = "";
let OAUTH_CLIENT_SECRET = "";
let OAUTH_REFRESH_TOKEN = "";
const GDRIVE_TOKEN_URI = "https://oauth2.googleapis.com/token";

/**
 * Initialize GDrive credentials from Cloudflare Worker env.
 * Must be called once per request from the server entry point.
 */
export function initGDriveEnv(env: Record<string, string | undefined>) {
  GDRIVE_FOLDER_ID = env.GDRIVE_FOLDER_ID || "";
  OAUTH_CLIENT_ID = env.GDRIVE_CLIENT_ID || "";
  OAUTH_CLIENT_SECRET = env.GDRIVE_CLIENT_SECRET || "";
  OAUTH_REFRESH_TOKEN = env.GDRIVE_REFRESH_TOKEN || "";
}

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

export async function getGoogleDriveAccessToken(): Promise<string> {
  if (!OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET || !OAUTH_REFRESH_TOKEN) {
    throw new Error("Google Drive OAuth2 credentials chưa được cấu hình.");
  }

  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const res = await fetch(GDRIVE_TOKEN_URI, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      client_secret: OAUTH_CLIENT_SECRET,
      refresh_token: OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google OAuth2 token refresh failed (${res.status}): ${errText}`);
  }

  const data = (await res.json()) as { access_token: string; expires_in?: number };
  cachedAccessToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in || 3600),
  };

  return data.access_token;
}

/**
 * Handle POST /api/gdrive-upload
 * Streams incoming request.body directly to Google Drive Resumable Upload API.
 * Uses ~0 MB RAM on Cloudflare Worker.
 */
export async function handleGDriveUploadRequest(request: Request): Promise<Response> {
  try {
    const fileNameHeader = request.headers.get("x-file-name");
    const fileSizeHeader = request.headers.get("x-file-size");
    const contentType = request.headers.get("content-type") || "application/octet-stream";

    const fileName = fileNameHeader ? decodeURIComponent(fileNameHeader) : "file.bin";
    const fileSize = fileSizeHeader || "0";

    const token = await getGoogleDriveAccessToken();

    // Step 1: Create Resumable Upload Session
    const metadata = { name: fileName, parents: [GDRIVE_FOLDER_ID] };
    const sessionRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Type": contentType,
          "X-Upload-Content-Length": fileSize,
        },
        body: JSON.stringify(metadata),
      },
    );

    if (!sessionRes.ok) {
      const errText = await sessionRes.text();
      return new Response(
        JSON.stringify({
          error: `Tạo phiên Google Drive thất bại (${sessionRes.status}): ${errText}`,
        }),
        { status: sessionRes.status, headers: { "Content-Type": "application/json" } },
      );
    }

    const uploadUrl = sessionRes.headers.get("location");
    if (!uploadUrl) {
      return new Response(JSON.stringify({ error: "Google Drive không trả về URL tải tệp." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 2: Stream request.body directly to uploadUrl
    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body: request.body,
      duplex: "half",
    } as RequestInit);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      return new Response(
        JSON.stringify({
          error: `Tải tệp lên Google Drive thất bại (${uploadRes.status}): ${errText}`,
        }),
        { status: uploadRes.status, headers: { "Content-Type": "application/json" } },
      );
    }

    const driveData = (await uploadRes.json()) as { id: string };



    return new Response(
      JSON.stringify({
        id: driveData.id,
        name: fileName,
        size: Number(fileSize),
        mimeType: contentType,
        url: `gdrive://${driveData.id}`,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("GDrive upload server handler error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Lỗi server khi tải tệp." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Handle GET /api/gdrive-proxy
 * Streams media from Google Drive with Range header support for video seeking.
 */
export async function handleGDriveProxyRequest(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const fileId = url.searchParams.get("id");
    const isDownload = url.searchParams.get("download") === "true";
    const fileName = url.searchParams.get("name");

    if (!fileId) {
      return new Response("Missing file ID", { status: 400 });
    }

    const token = await getGoogleDriveAccessToken();
    const gdriveUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;

    const reqHeaders: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const range = request.headers.get("range");
    if (range) reqHeaders["Range"] = range;

    const gdriveRes = await fetch(gdriveUrl, { headers: reqHeaders });

    if (!gdriveRes.ok && gdriveRes.status !== 206) {
      return new Response(`Google Drive fetch failed: ${gdriveRes.status}`, {
        status: gdriveRes.status,
      });
    }

    const resHeaders = new Headers();
    const cType = gdriveRes.headers.get("Content-Type");
    if (cType) resHeaders.set("Content-Type", cType);

    const cLen = gdriveRes.headers.get("Content-Length");
    if (cLen) resHeaders.set("Content-Length", cLen);

    const cRange = gdriveRes.headers.get("Content-Range");
    if (cRange) resHeaders.set("Content-Range", cRange);

    resHeaders.set("Accept-Ranges", "bytes");

    if (isDownload && fileName) {
      resHeaders.set(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(fileName)}"`,
      );
    } else {
      resHeaders.set("Content-Disposition", "inline");
    }

    resHeaders.set("Cache-Control", "public, max-age=3600");

    return new Response(gdriveRes.body, {
      status: gdriveRes.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("GDrive proxy error:", err);
    return new Response(err instanceof Error ? err.message : "Proxy error", { status: 500 });
  }
}
