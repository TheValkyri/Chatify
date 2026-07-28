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
import { EmptyHint, MediaGridItem, MemberRowActions } from "./helpers";
import { fmtSize } from "./helpers";

export function DetailPanel({
  conv,
  messages,
  onPreview,
  onInvite,
  onViewProfile,
  onLeaveGroup,
  session,
}: {
  conv: Conversation;
  messages: Message[];
  onPreview: (att: Attachment) => void;
  onInvite: () => void;
  onViewProfile: (m: Member) => void;
  onLeaveGroup: () => void;
  session: AuthUser;
}) {
  const isGroup =
    conv.isGroup ||
    String(conv.id).startsWith("") ||
    conv.name?.includes("Nhóm") ||
    conv.name?.includes("Đội");
  const [tab, setTab] = useState<"media" | "files" | "members">("media");
  const media = messages.filter(
    (m) => m.attachment?.kind === "image" || m.attachment?.kind === "video",
  );
  const files = messages.filter(
    (m) => m.attachment?.kind === "file" || m.attachment?.kind === "folder",
  );

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
  };
  const itemV = {
    hidden: { opacity: 0, y: 14, scale: 0.94 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 320, damping: 24 },
    },
  };

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={springSidebar}
      className="scroll-thin shrink-0 overflow-hidden border-l border-border bg-background/55 backdrop-blur-xl"
    >
      <div className="scroll-thin flex h-full w-[320px] min-w-[320px] flex-col overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, ...springSoft }}
          className="flex flex-col items-center gap-3 px-6 pb-4 pt-8"
        >
          <img
            src={conv.avatar}
            alt={conv.name}
            className="h-20 w-20 rounded-full animate-pop-punch"
          />
          <div className="text-center">
            <div className="text-[16px] font-semibold">{conv.name}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {isGroup
                ? `${messages.length} tin nhắn`
                : conv.presence === "online"
                  ? "Đang hoạt động"
                  : "Ngoại tuyến"}
            </div>
            {isGroup && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onInvite}
                  className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  <UserPlus size={13} /> Tạo mã mời nhóm
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onLeaveGroup}
                  className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-4 py-1.5 text-[12px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <LogOut size={13} /> Rời nhóm
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>

        <div className="mx-4 mb-4 grid grid-cols-3 gap-1 rounded-full bg-surface p-1 text-[12.5px]">
          {(
            [
              { k: "media", l: "Media" },
              { k: "files", l: "Tệp" },
              { k: "members", l: "Thành viên" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="relative rounded-full px-3 py-1.5 font-medium"
            >
              {tab === t.k && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span
                className={`relative ${
                  tab === t.k ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {t.l}
              </span>
            </button>
          ))}
        </div>

        <div className="px-4 pb-6">
          <AnimatePresence mode="wait">
            {tab === "media" && (
              <motion.div
                key="media"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="grid grid-cols-3 gap-1.5"
              >
                {media.length === 0 ? (
                  <EmptyHint text="Chưa có ảnh/video" />
                ) : (
                  media.map((m) => (
                    <MediaGridItem key={m.id} m={m} itemV={itemV} onPreview={onPreview} />
                  ))
                )}
              </motion.div>
            )}

            {tab === "files" && (
              <motion.div
                key="files"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col gap-1.5"
              >
                {files.length === 0 ? (
                  <EmptyHint text="Chưa có tệp nào" />
                ) : (
                  files.map((m) => {
                    const a = m.attachment!;
                    return (
                      <motion.div
                        key={m.id}
                        variants={itemV}
                        whileHover={{ x: 3 }}
                        onClick={async () => {
                          try {
                            await downloadAttachment(a);
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Không thể tải tệp xuống.",
                            );
                          }
                        }}
                        className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 cursor-pointer hover:bg-surface-2 transition-colors"
                      >
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
                          {a.kind === "folder" ? <Folder size={16} /> : <FileText size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">
                            {a.kind === "folder" || a.kind === "file" ? a.name : ""}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.kind === "folder"
                              ? `${a.files} tệp · ${a.size}`
                              : a.kind === "file"
                                ? `${a.ext.toUpperCase()} · ${a.size}`
                                : ""}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}

            {tab === "members" && (
              <motion.div
                key="members"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col gap-1.5"
              >
                {(() => {
                  const members: Member[] =
                    conv.members && conv.members.length > 0
                      ? conv.members
                      : [
                          {
                            id: session.id,
                            name: session.name,
                            avatar: session.avatar,
                            role: "member" as const,
                          },
                        ];
                  const myMember = (conv.members || []).find((m) => m.id === session.id);
                  const isOwner = myMember?.role === "owner";

                  return (
                    <>
                      <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Danh sách ({members.length})
                      </div>
                      {members.map((m, i) => (
                        <motion.div
                          key={m.id || i}
                          variants={itemV}
                          whileHover={{ x: 3 }}
                          onClick={() => onViewProfile(m)}
                          className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 cursor-pointer hover:bg-surface-2 transition-all"
                        >
                          <img
                            src={m.avatar}
                            alt={m.name}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="text-[13px] font-medium flex items-center gap-1.5 truncate">
                              <span className="truncate">{m.name}</span>
                              {conv.isGroup && m.role === "owner" && (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[8px] font-bold text-amber-500 uppercase tracking-wide shrink-0">
                                  Trưởng nhóm
                                </span>
                              )}
                              {conv.isGroup && m.role === "admin" && (
                                <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[8px] font-bold text-indigo-500 uppercase tracking-wide shrink-0">
                                  Phó nhóm
                                </span>
                              )}
                            </div>
                            {m.id !== session.id && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                @{m.username || m.name.toLowerCase().replace(/\s+/g, "")}
                              </div>
                            )}
                          </div>

                          {conv.isGroup && isOwner && m.id !== session.id && (
                            <MemberRowActions
                              member={m}
                              convId={conv.id}
                              actorName={session.name}
                              actorId={session.id}
                            />
                          )}
                        </motion.div>
                      ))}
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}
