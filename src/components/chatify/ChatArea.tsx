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
import { buildAttachment, buildAttachmentAsync, uploadFile } from "@/lib/upload";
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
import { MessageRow } from "./MessageRow";
import { Composer } from "./Composer";
import { fmtSize, getDroppedFiles, DayDivider } from "./helpers";

export function ChatArea({
  conversationId,
  messages,
  onSend,
  onPreview,
  updateMessage,
  currentUserId,
  isStranger,
  otherMemberName,
  onSendFriendRequest,
  members,
  isGroup,
}: {
  conversationId: string;
  messages: Message[];
  onSend: (m: Message) => void;
  onPreview: (att: Attachment) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  currentUserId: string;
  isStranger?: boolean;
  otherMemberName?: string;
  onSendFriendRequest?: () => void;
  members?: Member[];
  isGroup?: boolean;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftsRef = useRef<Draft[]>([]);
  const retainedPreviewUrls = useRef(new Set<string>());

  const revokePreview = (draft: Draft) => {
    if (draft.url) URL.revokeObjectURL(draft.url);
  };

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const currentRetained = retainedPreviewUrls.current;
    return () => {
      draftsRef.current.forEach(revokePreview);
      currentRetained.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    draftsRef.current.forEach(revokePreview);
    setText("");
    setDrafts([]);
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, drafts.length]);

  const addEntries = (entries: OriginalFile[], asFolder = false) => {
    if (!entries.length) return;
    if (asFolder) {
      const folderName = entries[0].path.split("/")[0] || "Thư mục đã chọn";
      const total = entries.reduce((sum, source) => sum + source.file.size, 0);
      setDrafts((d) => [
        ...d,
        {
          id: crypto.randomUUID(),
          kind: "folder",
          name: folderName,
          size: fmtSize(total),
          meta: `${entries.length} tệp`,
          folderFiles: entries.slice(0, 6).map((source) => ({
            name: source.path,
            size: fmtSize(source.file.size),
          })),
          sourceFiles: entries,
        },
      ]);
      return;
    }
    const newDrafts: Draft[] = entries.map(({ file: f }) => {
      const type = f.type;
      if (type.startsWith("image/")) {
        return {
          id: crypto.randomUUID(),
          file: f,
          url: URL.createObjectURL(f),
          kind: "image",
          name: f.name,
          size: fmtSize(f.size),
        };
      }
      if (type.startsWith("video/")) {
        return {
          id: crypto.randomUUID(),
          file: f,
          url: URL.createObjectURL(f),
          kind: "video",
          name: f.name,
          size: fmtSize(f.size),
        };
      }
      if (type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(f.name)) {
        return {
          id: crypto.randomUUID(),
          file: f,
          url: URL.createObjectURL(f),
          kind: "audio",
          name: f.name,
          size: fmtSize(f.size),
        };
      }
      return {
        id: crypto.randomUUID(),
        file: f,
        url: URL.createObjectURL(f),
        kind: "file",
        name: f.name,
        size: fmtSize(f.size),
      };
    });
    setDrafts((d) => [...d, ...newDrafts]);
  };

  const addFiles = (files: FileList | File[], asFolder = false) => {
    const entries = Array.from(files).map((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return { file, path };
    });
    addEntries(entries, asFolder);
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.id === id);
      if (removed) revokePreview(removed);
      return current.filter((draft) => draft.id !== id);
    });
  };

  const clearAllDrafts = () => {
    drafts.forEach(revokePreview);
    setDrafts([]);
  };

  const handleDraftPreview = (d: Draft) => {
    if (d.kind === "image" || d.kind === "video" || d.kind === "audio") {
      onPreview({
        kind: d.kind,
        name: d.name,
        size: d.size,
        dims: d.kind === "image" ? "Ảnh" : "",
        duration: d.kind === "video" ? "Video" : d.kind === "audio" ? "Audio" : "",
        url: d.url || "",
      });
    }
  };

  const handleAttachmentSend = async (d: Draft, now: string) => {
    const tempId = crypto.randomUUID();
    const optimisticAttachment: Attachment = {
      kind: d.kind,
      name: d.name,
      size: d.size,
      url: d.url || "",
    } as Attachment;

    onSend({
      id: tempId,
      author: currentUserId,
      time: now,
      status: "sending",
      attachment: optimisticAttachment,
    });

    if (d.url) retainedPreviewUrls.current.add(d.url);

    try {
      let fileToUpload: File;
      if (d.kind === "folder") {
        if (!d.sourceFiles?.length) {
          throw new Error("Thư mục này không có tệp nguồn.");
        }
        const blob = await zipFolderToBlob(d.sourceFiles);
        fileToUpload = new File([blob], `${d.name}.zip`, { type: "application/zip" });
      } else {
        if (!d.file) throw new Error("Tệp đính kèm không hợp lệ.");
        fileToUpload = d.file;
      }

      const uploaded = await uploadFile(fileToUpload, conversationId, (progress) => {
        updateMessage(tempId, {
          attachment: { ...optimisticAttachment, uploadProgress: progress.percent } as Attachment,
        });
      });

      const finalAttachment = await buildAttachmentAsync(uploaded, fileToUpload);
      if (d.kind === "folder") {
        const folderAttachment = finalAttachment as unknown as Extract<
          Attachment,
          { kind: "folder" }
        >;
        folderAttachment.kind = "folder";
        folderAttachment.files = parseInt(d.meta ?? "0");
        folderAttachment.children = d.folderFiles ?? [];
      }

      updateMessage(tempId, { attachment: finalAttachment, status: "sent" });
    } catch (err) {
      updateMessage(tempId, { status: "failed" });
      toast.error(err instanceof Error ? err.message : "Không thể tải tệp lên.");
    }
  };

  const submit = () => {
    if (!text.trim() && drafts.length === 0) return;
    const now = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (text.trim()) {
      onSend({
        id: crypto.randomUUID(),
        author: currentUserId,
        time: now,
        text: text.trim(),
        status: "sent",
      });
    }

    drafts.forEach((d) => {
      handleAttachmentSend(d, now);
    });

    setText("");
    setDrafts([]);
    taRef.current?.focus();
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragCounter.current--;
        if (dragCounter.current <= 0) setDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        const files = await getDroppedFiles(e.dataTransfer.items);
        const containsDirectory = files.some((file) => file.path.includes("/"));
        addEntries(files, containsDirectory);
      }}
    >
      {isStranger && (
        <div className="flex items-center justify-between gap-3 bg-amber-500/10 border-b border-amber-500/20 px-6 py-2.5 text-[13px] text-amber-500 shrink-0 select-none">
          <div className="flex items-center gap-2 font-medium">
            <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider">
              Người lạ
            </span>
            <span>Bạn và {otherMemberName || "người này"} chưa phải là bạn bè trên Chatify.</span>
          </div>
          {onSendFriendRequest && (
            <button
              onClick={onSendFriendRequest}
              className="rounded-full bg-amber-500 px-3.5 py-1 text-[12px] font-semibold text-black hover:bg-amber-400 transition-colors shrink-0 shadow-xs"
            >
              + Kết bạn
            </button>
          )}
        </div>
      )}
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 md:px-8 py-6">
        <div className="mx-auto flex w-full max-w-4xl 2xl:max-w-5xl flex-col transition-all duration-300">
          <DayDivider label="Hôm nay" />
          <AnimatePresence initial={false}>
            {messages.map((m, idx) => {
              const prevMsg = messages[idx - 1];
              const isSameAuthorAsPrev =
                prevMsg &&
                prevMsg.author === m.author &&
                !prevMsg.text?.startsWith("📌 ") &&
                prevMsg.author !== "system";

              const showAuthorName = !isSameAuthorAsPrev;
              const showAvatar = !isSameAuthorAsPrev;

              return (
                <MessageRow
                  key={m.id}
                  m={m}
                  onPreview={onPreview}
                  currentUserId={currentUserId}
                  members={members}
                  isGroup={isGroup}
                  showAuthorName={showAuthorName}
                  showAvatar={showAvatar}
                />
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-4 z-20 grid place-items-center"
          >
            <div className="absolute inset-0 rounded-3xl border-2 border-dashed border-primary/60 bg-background/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              transition={springSoft}
              className="relative flex flex-col items-center gap-2 text-center"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Paperclip size={22} />
              </div>
              <div className="text-lg font-semibold">Thả để đính kèm</div>
              <div className="text-sm text-muted-foreground">
                File và cả thư mục — Chatify giữ nguyên bản gốc
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Composer
        text={text}
        setText={setText}
        drafts={drafts}
        removeDraft={removeDraft}
        addFiles={addFiles}
        onSubmit={submit}
        taRef={taRef}
        clearAll={clearAllDrafts}
        onPreview={handleDraftPreview}
      />
    </div>
  );
}
