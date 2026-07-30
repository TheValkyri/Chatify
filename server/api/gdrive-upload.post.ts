// ─── Google Drive Upload API Route ─────────────────────────────────────────
// POST /api/gdrive-upload
// Accepts FormData with a "file" field, uploads to Google Drive 5TB storage.
// Called with XHR from client to get real upload progress tracking.

import { defineEventHandler, readFormData, createError } from "h3";
import { getGoogleDriveAccessToken, GDRIVE_FOLDER_ID } from "../utils/gdrive-auth";

export default defineEventHandler(async (event) => {
  const formData = await readFormData(event);
  const file = formData.get("file") as File | null;
  if (!file) {
    throw createError({
      statusCode: 400,
      statusMessage: "Không có tệp nào được gửi lên server.",
    });
  }

  const token = await getGoogleDriveAccessToken();

  // Build multipart body for Google Drive upload
  const metadata = { name: file.name, parents: [GDRIVE_FOLDER_ID] };
  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelim = "\r\n--" + boundary + "--";
  const mimeType = file.type || "application/octet-stream";

  const metadataPart =
    delimiter + "Content-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(metadata);
  const mediaHeader = delimiter + `Content-Type: ${mimeType}\r\n\r\n`;

  const enc = new TextEncoder();
  const fileBuffer = await file.arrayBuffer();
  const parts = [
    enc.encode(metadataPart),
    enc.encode(mediaHeader),
    new Uint8Array(fileBuffer),
    enc.encode(closeDelim),
  ];
  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const fullBody = new Uint8Array(totalLen);
  let offset = 0;
  for (const part of parts) {
    fullBody.set(part, offset);
    offset += part.length;
  }

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
    throw createError({
      statusCode: uploadRes.status,
      statusMessage: `Google Drive upload failed: ${errText}`,
    });
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
      body: JSON.stringify({ role: "reader", type: "anyone" }),
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
  };
});
