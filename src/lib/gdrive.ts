// ─── Google Drive API Storage Service ─────────────────────────────────────────
// Connects Chatify directly to Google Drive 5TB storage.

import SERVICE_ACCOUNT from "../../capable-sled-503905-r7-2aae63abc97b.json";

export const GDRIVE_FOLDER_ID = "1EhKOuWTR0TPk8H_o55_AwiCdfAs5vk9d";

let cachedAccessToken: { token: string; expiresAt: number } | null = null;

/**
 * Converts PEM formatted RSA private key to CryptoKey using Web Crypto API.
 * Works natively in Browser, Cloudflare Workers, Node.js, and Nitro.
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

/**
 * Encodes string to Base64URL format without padding.
 */
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
 * Generates an OAuth2 Access Token for Google Service Account using RS256 JWT.
 */
export async function getGoogleDriveAccessToken(): Promise<string> {
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

  const data = await res.json();
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

/**
 * Uploads a file directly to Google Drive 5TB folder with real XHR progress tracking.
 */
export async function uploadFileToGDrive(
  file: File,
  onProgress?: (progress: GDriveUploadProgress) => void,
): Promise<GDriveUploadResult> {
  const token = await getGoogleDriveAccessToken();

  // Step 1: Initiate Resumable Upload Session
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Upload-Content-Type": file.type || "application/octet-stream",
        "X-Upload-Content-Length": file.size.toString(),
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        name: file.name,
        parents: [GDRIVE_FOLDER_ID],
      }),
    },
  );

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`Google Drive upload init failed (${initRes.status}): ${errText}`);
  }

  const uploadLocation = initRes.headers.get("Location");
  if (!uploadLocation) {
    throw new Error("Không thể khởi tạo link tải lên Google Drive.");
  }

  // Step 2: Upload file via XHR with progress tracking
  const fileData = await new Promise<GDriveUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadLocation);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        const percent = Math.round((e.loaded / e.total) * 100);
        onProgress({ loaded: e.loaded, total: e.total, percent });
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          if (onProgress) {
            onProgress({ loaded: file.size, total: file.size, percent: 100 });
          }
          resolve({
            id: data.id,
            name: data.name || file.name,
            size: file.size,
            mimeType: data.mimeType || file.type,
            url: `gdrive://${data.id}`,
            directUrl: getGDriveDirectUrl(data.id),
          });
        } catch (err) {
          reject(new Error("Lỗi đọc dữ liệu phản hồi từ Google Drive."));
        }
      } else {
        reject(new Error(`Tải tệp lên Google Drive thất bại (${xhr.status}): ${xhr.responseText}`));
      }
    };

    xhr.onerror = () => reject(new Error("Lỗi kết nối mạng khi tải tệp lên Google Drive."));
    xhr.send(file);
  });

  // Step 3: Set public reader permission so anyone in chat can view/download
  try {
    await fetch(`https://www.googleapis.com/drive/v3/files/${fileData.id}/permissions`, {
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

  return fileData;
}

/**
 * Returns ultra-fast Google CDN direct viewing URL for a Google Drive file ID.
 */
export function getGDriveDirectUrl(fileId: string): string {
  return `https://lh3.googleusercontent.com/d/${fileId}`;
}

/**
 * Returns direct download URL for a Google Drive file ID.
 */
export function getGDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}
