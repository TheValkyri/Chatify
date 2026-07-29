// ─── Chatify — Single Source of Truth for Data Types ────────────────────────
// All data models live here. Import from "@/lib/types" everywhere.
// This file defines the contract between frontend and backend.

// ─── Presence ───────────────────────────────────────────────────────────────
export type Presence = "online" | "away" | "offline";

// ─── Members ────────────────────────────────────────────────────────────────
export type MemberRole = "owner" | "admin" | "member";

export type Member = {
  id: string;
  name: string;
  avatar: string;
  role: MemberRole;
  username?: string;
};

// ─── Conversations ──────────────────────────────────────────────────────────
export type Conversation = {
  id: string;
  name: string;
  avatar: string;
  preview: string;
  time: string;
  unread: number;
  presence: Presence;
  isGroup: boolean;
  description?: string;
  members: Member[];
};

// ─── Attachments ────────────────────────────────────────────────────────────
export type ImageAttachment = {
  kind: "image";
  id?: string;
  name: string;
  size: string;
  dims: string;
  url: string;
  thumbnailUrl?: string;
  uploadProgress?: number;
  source?: File; // client-only, never serialized
};

export type VideoAttachment = {
  kind: "video";
  id?: string;
  name: string;
  size: string;
  duration: string;
  url?: string;
  poster?: string;
  thumbnailUrl?: string;
  uploadProgress?: number;
  source?: File; // client-only, never serialized
};

export type AudioAttachment = {
  kind: "audio";
  id?: string;
  name: string;
  size: string;
  duration?: string;
  url?: string;
  uploadProgress?: number;
  source?: File; // client-only, never serialized
};

export type FileAttachment = {
  kind: "file";
  id?: string;
  name: string;
  size: string;
  ext: string;
  url?: string;
  uploadProgress?: number;
  source?: File; // client-only, never serialized
};

export type FolderAttachment = {
  kind: "folder";
  id?: string;
  name: string;
  files: number;
  size: string;
  children: { name: string; size: string }[];
  url?: string;
  uploadProgress?: number;
  sourceFiles?: import("@/lib/file-transfer").OriginalFile[]; // client-only
};

export type Attachment =
  | ImageAttachment
  | VideoAttachment
  | AudioAttachment
  | FileAttachment
  | FolderAttachment;

// ─── Messages ───────────────────────────────────────────────────────────────
export type MessageStatus = "local" | "sending" | "sent" | "delivered" | "read" | "failed";

export type Message = {
  id: string;
  clientTempId?: string; // UUID for optimistic updates
  author: string; // user ID or "me" (resolved at render time)
  time: string;
  text?: string;
  attachment?: Attachment;
  status: MessageStatus;
};

// ─── Notifications ──────────────────────────────────────────────────────────
export type NotificationIcon = "msg" | "friend" | "call";

export type Notification = {
  id: string;
  title: string;
  body: string;
  time: string;
  unread: boolean;
  icon: NotificationIcon;
};

// ─── Friends ────────────────────────────────────────────────────────────────
export type Friend = {
  id: string;
  name: string;
  avatar: string;
  status: string;
  online: boolean;
  username?: string;
};

// ─── Profile ────────────────────────────────────────────────────────────────
export type Profile = {
  name: string;
  username: string;
  avatar: string;
  cover: string;
  bio: string;
  birthday: string;
  phone: string;
  email: string;
};

// ─── Search / Invite ────────────────────────────────────────────────────────
export type SearchResultUser = {
  type: "user";
  id: string;
  name: string;
  username?: string;
  phone?: string;
  avatar?: string;
};

export type SearchResultGroup = {
  type: "group";
  name: string;
  groupId: string;
};

export type SearchResult = SearchResultUser | SearchResultGroup;

// ─── Invite Code ────────────────────────────────────────────────────────────
export type InviteCode = {
  code: string;
  groupId: string;
  groupName: string;
  expires: number | null; // epoch ms or null for infinite
  maxUses: number | null; // null for infinite
  uses: number;
};

// ─── Auth ───────────────────────────────────────────────────────────────────
export type AuthUser = {
  id: string;
  name: string;
  email: string;
  username: string;
  avatar: string;
};

// ─── Draft (for composing messages with attachments) ────────────────────────
// Drafts are client-only and hold File objects temporarily before upload.
// They are NEVER persisted to localStorage or sent to the server as-is.
export type Draft = {
  id: string;
  file?: File; // client-only, never serialized
  url?: string; // blob URL for preview, never serialized
  kind: "image" | "video" | "audio" | "file" | "folder";
  name: string;
  size: string;
  meta?: string;
  folderFiles?: { name: string; size: string }[];
  sourceFiles?: { file: File; path: string }[];
};
