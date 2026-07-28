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

export function ChatHeader({
  conv,
  showDetail,
  onToggleDetail,
  onCall,
  onInvite,
}: {
  conv: Conversation;
  showDetail: boolean;
  onToggleDetail: () => void;
  onCall: (kind: "voice" | "video") => void;
  onInvite: () => void;
}) {
  const isGroup =
    conv.isGroup ||
    String(conv.id).startsWith("") ||
    conv.name?.includes("Nhóm") ||
    conv.name?.includes("Đội");
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border px-6">
      <img src={conv.avatar} alt={conv.name} className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{conv.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              conv.presence === "online"
                ? "bg-emerald-400"
                : conv.presence === "away"
                  ? "bg-amber-400"
                  : "bg-muted-foreground/50"
            }`}
          />
          {conv.presence === "online"
            ? "Đang hoạt động"
            : conv.presence === "away"
              ? "Vắng mặt"
              : "Ngoại tuyến"}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isGroup && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onInvite}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground mr-1"
            aria-label="Mời thành viên"
            title="Mời vào nhóm bằng mã code"
          >
            <UserPlus size={18} />
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onCall("voice")}
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Gọi thoại"
        >
          <Phone size={18} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onCall("video")}
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Gọi video"
        >
          <Video size={18} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={onToggleDetail}
          className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
            showDetail
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
          aria-label="Chi tiết"
        >
          <Info size={18} />
        </motion.button>
      </div>
    </header>
  );
}
