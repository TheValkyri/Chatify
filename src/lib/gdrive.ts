// ─── Google Drive API Storage Service ─────────────────────────────────────────
// Connects Chatify directly to Google Drive 5TB storage via Server Function.

import { createServerFn } from "@tanstack/react-start";
import SERVICE_ACCOUNT from "../../capable-sled-503905-r7-2aae63abc97b.json";

export const GDRIVE_FOLDER_ID = "1EhKOuWTR0TPk8H_o55_AwiCdfAs5vk9d";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Converts PEM formatted RSA private key to CryptoKey using Web Crypto API.
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = pem.replace(pemHeader, "").replace(pemFooter, "").replace(/\s+/g, "");

  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  return crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"],
  );
}

function base64url(str: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof str === "string") {
    bytes = new TextEncoder().encode(str);
  } else {
    bytes = new Uint8Array(str);
  }
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

/**
 * Generates OAuth2 Access Token for Google Service Account on Server (Cloudflare Worker/Nitro).
 */
async function getGoogleDriveAccessTokenServer(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 60) {
    return cachedAccessToken.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claimSet = {
    iss: SERVICE_ACCOUNT.client_email,
    scope: "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive",
    aud: SERVICE_ACCOUNT.token_uri,
    exp: now + 3600,
    iat: now,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaimSet = base64url(JSON.stringify(claimSet));
  const unsignedToken = `${encodedHeader}.${encodedClaimSet}`;

  const privateKey = await importPrivateKey(SERVICE_ACCOUNT.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(unsignedToken),
  );

  const jwt = `${unsignedToken}.${base64url(signature)}`;

  const res = await fetch(SERVICE_ACCOUNT.token_uri, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google Auth Token failed (${res.status}): ${errText}`);
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

    const token = await getGoogleDriveAccessTokenServer();

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

    const driveData = (await uploadRes.json()) as { id: string; name?: string; mimeType?: string };

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
