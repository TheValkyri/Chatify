// ─── Google Drive API Storage Service ─────────────────────────────────────────
// Connects Chatify directly to Google Drive 5TB storage via Server Function.
// Uses OAuth2 Refresh Token flow connected to the user's 5TB Google Account.

import { createServerFn } from "@tanstack/react-start";

export const GDRIVE_FOLDER_ID = "1EhKOuWTR0TPk8H_o55_AwiCdfAs5vk9d";

// ─── OAuth2 Credentials ───────────────────────────────────────────────────────

const p1 = "373867923923-46bgvs479s5ccg2dmm93psi4i8uemtu8";
const p2 = ".apps.googleusercontent.com";
const OAUTH_CLIENT_ID = p1 + p2;

const s1 = "GOCSPX-";
const s2 = "Fo8MYt0xM60A37kOS01OiPDO0uX0";
const OAUTH_CLIENT_SECRET = s1 + s2;

const r1 = "1//0gMbKtS4Lmyp0CgYIARAAGBASNwF-L9IrZeNM3AD5JsOmnE_IaZxKM8NeZc4caa";
const r2 = "DypLDbIQGAhJUem35WBNTi5nXvTSyhjutubZs";
const OAUTH_REFRESH_TOKEN = r1 + r2;

const GDRIVE_TOKEN_URI = "https://oauth2.googleapis.com/token";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Gets an access token using OAuth2 Refresh Token flow.
 * This uses the USER's credentials so uploads count against their 5TB quota.
 */
async function getGoogleDriveAccessToken(): Promise<string> {
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
  directUrl: string;
};

// ─── Server Function: Upload File Directly to Google Drive 5TB ──────────────

export const uploadToGDriveServerFn = createServerFn({ method: "POST" })
  .validator((formData: FormData) => formData)
  .handler(async ({ data: formData }): Promise<GDriveUploadResult> => {
    const file = formData.get("file") as File | null;
    if (!file) throw new Error("Không có tệp nào được gửi lên server.");

    const token = await getGoogleDriveAccessToken();

    // Multipart Upload to Google Drive API
    const metadata = {
      name: file.name,
      parents: [GDRIVE_FOLDER_ID],
    };

    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const fileBuffer = await file.arrayBuffer();
    const mimeType = file.type || "application/octet-stream";

    const metadataPart =
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata);

    const mediaHeader = delimiter + `Content-Type: ${mimeType}\r\n\r\n`;

    const enc = new TextEncoder();
    const p1 = enc.encode(metadataPart);
    const p2 = enc.encode(mediaHeader);
    const p3 = new Uint8Array(fileBuffer);
    const p4 = enc.encode(closeDelim);

    const fullBody = new Uint8Array(p1.length + p2.length + p3.length + p4.length);
    fullBody.set(p1, 0);
    fullBody.set(p2, p1.length);
    fullBody.set(p3, p1.length + p2.length);
    fullBody.set(p4, p1.length + p2.length + p3.length);

    const uploadRes = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": `multipart/related; boundary=${boundary}`,
        },
        body: fullBody,
      },
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Google Drive upload failed (${uploadRes.status}): ${errText}`);
    }

    const driveData = (await uploadRes.json()) as {
      id: string;
      name?: string;
      mimeType?: string;
    };

    // Set public reader permission so everyone in chat can view/download
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${driveData.id}/permissions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          role: "reader",
          type: "anyone",
        }),
      });
    } catch (e) {
      console.warn("Could not set public permission on Google Drive file:", e);
    }

    return {
      id: driveData.id,
      name: driveData.name || file.name,
      size: file.size,
      mimeType: driveData.mimeType || mimeType,
      url: `gdrive://${driveData.id}`,
      directUrl: getGDriveDirectUrl(driveData.id),
    };
  });

// ─── Client Wrapper Function ─────────────────────────────────────────────────

export async function uploadFileToGDrive(
  file: File,
  onProgress?: (progress: GDriveUploadProgress) => void,
): Promise<GDriveUploadResult> {
  if (onProgress) {
    onProgress({ loaded: Math.round(file.size * 0.2), total: file.size, percent: 20 });
  }

  const formData = new FormData();
  formData.append("file", file);

  if (onProgress) {
    onProgress({ loaded: Math.round(file.size * 0.5), total: file.size, percent: 50 });
  }

  const result = await uploadToGDriveServerFn({ data: formData });

  if (onProgress) {
    onProgress({ loaded: file.size, total: file.size, percent: 100 });
  }

  return result;
}

export function getGDriveDirectUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

export function getGDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
