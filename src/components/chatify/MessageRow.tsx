import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE, springSoft, springSidebar } from "@/lib/animation";
import {
  Search,
  Phone,
  Video,
  Info,
  Plus,
  Image as ImageIcon,
  FileText,
  Folder,
  Paperclip,
  Send,
  X,
  Play,
  Download,
  ChevronDown,
  MessageSquare,
  Users,
  Settings,
  Bell,
  Check,
  CheckCheck,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  UserPlus,
  MoreHorizontal,
} from "lucide-react";
import { STORAGE_KEYS } from "@/lib/config";
import { toast } from "sonner";
import {
  downloadFile,
  downloadFolder,
  downloadAttachment,
  zipFolderToBlob,
  type OriginalFile,
} from "@/lib/file-transfer";
import { buildAttachment, uploadFile } from "@/lib/upload";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import type {
  Attachment,
  Message,
  Conversation,
  Member,
  Notification,
  Friend,
  Profile,
  AuthUser,
  Draft,
} from "@/lib/types";
import { LiquidTransition } from "./Modals";
import { AttachmentView } from "./helpers";
import { fmtSize } from "./helpers";

export function MessageRow({
  m,
  onPreview,
  currentUserId,
}: {
  m: Message;
  onPreview: (att: Attachment) => void;
  currentUserId: string;
}) {
  if (m.text?.startsWith("📌 ") || m.author === "system") {
    const cleanText = m.text?.replace(/^📌\s*/, "") ?? "";
    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 6, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={springSoft}
        className="my-3 flex w-full justify-center px-4"
      >
        <div className="flex items-center gap-1.5 rounded-full bg-surface/90 backdrop-blur-md border border-border/60 px-4 py-1.5 text-[12px] font-medium text-foreground/80 shadow-sm select-none">
          <span className="text-[13px] text-amber-500 shrink-0">📌</span>
          <span className="truncate">{cleanText}</span>
          <span className="ml-1 text-[10px] text-muted-foreground shrink-0">{m.time}</span>
        </div>
      </motion.div>
    );
  }

  const isMe = m.author === currentUserId;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={springSoft}
      className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[560px] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
        {m.text && !m.attachment && (
          <div
            className={`whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[14.5px] leading-relaxed ${
              isMe
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-surface text-foreground rounded-bl-md"
            }`}
          >
            {m.text}
          </div>
        )}
        {m.attachment && (
          <AttachmentView att={m.attachment} isMe={isMe} onPreview={onPreview} status={m.status} />
        )}
        <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <span>{m.time}</span>
          {isMe && m.status === "read" && <CheckCheck size={13} className="text-primary" />}
          {isMe && m.status === "delivered" && <CheckCheck size={13} />}
          {isMe && m.status === "sent" && <Check size={13} />}
          {isMe && m.status === "local" && <span>trên thiết bị này</span>}
        </div>
      </div>
    </motion.div>
  );
}
