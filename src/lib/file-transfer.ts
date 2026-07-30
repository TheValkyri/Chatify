import { getAttachmentSignedUrl } from "./upload";

export type OriginalFile = {
  file: File;
  path: string;
};

const MAX_ZIP_SIZE = 0xffffffff;
const MAX_ZIP_ENTRIES = 0xffff;
const utf8 = new TextEncoder();

const crcTable = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function writeUInt16(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
}

function writeUInt32(buffer: Uint8Array, offset: number, value: number) {
  buffer[offset] = value & 0xff;
  buffer[offset + 1] = (value >>> 8) & 0xff;
  buffer[offset + 2] = (value >>> 16) & 0xff;
  buffer[offset + 3] = (value >>> 24) & 0xff;
}

function zipDate(date: Date) {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
  };
}

function normalizePath(path: string) {
  const parts = path.replaceAll("\\", "/").split("/");
  const safeParts = parts.filter((part) => part && part !== "." && part !== "..");
  return safeParts.join("/");
}

function createLocalHeader(name: Uint8Array, date: Date) {
  const header = new Uint8Array(30 + name.length);
  const dos = zipDate(date);
  writeUInt32(header, 0, 0x04034b50);
  writeUInt16(header, 4, 20);
  writeUInt16(header, 6, 0x0808);
  writeUInt16(header, 8, 0);
  writeUInt16(header, 10, dos.time);
  writeUInt16(header, 12, dos.date);
  writeUInt16(header, 26, name.length);
  header.set(name, 30);
  return header;
}

function createDataDescriptor(crc: number, size: number) {
  const descriptor = new Uint8Array(16);
  writeUInt32(descriptor, 0, 0x08074b50);
  writeUInt32(descriptor, 4, crc);
  writeUInt32(descriptor, 8, size);
  writeUInt32(descriptor, 12, size);
  return descriptor;
}

function createCentralHeader(
  name: Uint8Array,
  date: Date,
  crc: number,
  size: number,
  offset: number,
) {
  const header = new Uint8Array(46 + name.length);
  const dos = zipDate(date);
  writeUInt32(header, 0, 0x02014b50);
  writeUInt16(header, 4, 20);
  writeUInt16(header, 6, 20);
  writeUInt16(header, 8, 0x0808);
  writeUInt16(header, 10, 0);
  writeUInt16(header, 12, dos.time);
  writeUInt16(header, 14, dos.date);
  writeUInt32(header, 16, crc);
  writeUInt32(header, 20, size);
  writeUInt32(header, 24, size);
  writeUInt16(header, 28, name.length);
  writeUInt32(header, 42, offset);
  header.set(name, 46);
  return header;
}

function createEndRecord(entryCount: number, directorySize: number, directoryOffset: number) {
  const record = new Uint8Array(22);
  writeUInt32(record, 0, 0x06054b50);
  writeUInt16(record, 8, entryCount);
  writeUInt16(record, 10, entryCount);
  writeUInt32(record, 12, directorySize);
  writeUInt32(record, 16, directoryOffset);
  return record;
}

async function crc32(file: File) {
  const reader = file.stream().getReader();
  let crc = 0xffffffff;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const byte of value) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    }
  } finally {
    reader.releaseLock();
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function saveBlob(blob: Blob, name: string) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = name;
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
}

export function downloadFile(file: File) {
  saveBlob(file, file.name);
}

/**
 * Download an attachment.
 * Handles both URL-based files (production/demo) and legacy blob URLs.
 * No longer creates fake files — if a URL is unavailable, throws an error.
 */
export async function downloadAttachment(att: import("./types").Attachment) {
  // Primary path: download from URL (works for both server URLs and blob/data URIs)
  if (att.url) {
    if (att.url.startsWith("gdrive://")) {
      const fileId = att.url.replace("gdrive://", "");
      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      try {
        const response = await fetch(downloadUrl);
        if (!response.ok) throw new Error(`Tải tệp thất bại (${response.status})`);
        const blob = await response.blob();
        saveBlob(blob, att.name);
        return;
      } catch (err) {
        // Fallback: trigger direct link download if fetch is blocked
        console.warn("Direct blob fetch failed, falling back to anchor trigger:", err);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = att.name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        a.remove();
        return;
      }
    }

    try {
      let downloadUrl = att.url;
      if (!att.url.startsWith("blob:") && !att.url.startsWith("data:")) {
        downloadUrl = await getAttachmentSignedUrl(att.url);
      }
      const response = await fetch(downloadUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);
      const blob = await response.blob();
      saveBlob(blob, att.name);
      return;
    } catch (err) {
      // If fetch fails for a blob URL (expired), throw a clear error
      if (att.url.startsWith("blob:")) {
        throw new Error("File tạm thời đã hết hạn. Vui lòng tải lại trang và gửi lại file.");
      }
      throw err;
    }
  }

  // Folder type: download as ZIP if children exist
  if (att.kind === "folder" && att.children?.length) {
    // Note: In production, folder download would fetch each child URL.
    // This path is kept for demo mode compatibility.
    throw new Error("Tải thư mục chỉ khả dụng khi có kết nối server.");
  }

  throw new Error("File không khả dụng để tải.");
}

export async function zipFolderToBlob(files: OriginalFile[]): Promise<Blob> {
  if (!files.length) throw new Error("Thư mục này không có tệp nguồn để tải.");
  if (files.length > MAX_ZIP_ENTRIES) throw new Error("Thư mục có quá nhiều tệp để tạo ZIP.");

  const totalSize = files.reduce((sum, source) => sum + source.file.size, 0);
  if (totalSize > MAX_ZIP_SIZE) {
    throw new Error("Thư mục vượt giới hạn 4 GB của định dạng ZIP hiện tại.");
  }

  const parts: BlobPart[] = [];
  const directory: Uint8Array[] = [];
  let offset = 0;

  for (const source of files) {
    const path = normalizePath(source.path || source.file.name);
    if (!path) continue;

    const name = utf8.encode(path);
    const localHeader = createLocalHeader(name, new Date(source.file.lastModified));
    const checksum = await crc32(source.file);
    const descriptor = createDataDescriptor(checksum, source.file.size);
    const centralHeader = createCentralHeader(
      name,
      new Date(source.file.lastModified),
      checksum,
      source.file.size,
      offset,
    );

    parts.push(localHeader, source.file, descriptor);
    directory.push(centralHeader);
    offset += localHeader.length + source.file.size + descriptor.length;
  }

  if (!directory.length) throw new Error("Thư mục này không có tệp hợp lệ để tải.");

  const directorySize = directory.reduce((sum, entry) => sum + entry.length, 0);
  parts.push(
    ...directory.map((d) => d as BlobPart),
    createEndRecord(directory.length, directorySize, offset) as BlobPart,
  );
  return new Blob(parts, { type: "application/zip" });
}

export async function downloadFolder(files: OriginalFile[], archiveName: string) {
  const blob = await zipFolderToBlob(files);
  saveBlob(blob, `${archiveName || "chatify-files"}.zip`);
}
