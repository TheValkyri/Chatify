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
import { DraftChip } from "./helpers";

export function Composer({
  text,
  setText,
  drafts,
  removeDraft,
  addFiles,
  onSubmit,
  taRef,
  clearAll,
  onPreview,
}: {
  text: string;
  setText: (v: string) => void;
  drafts: Draft[];
  removeDraft: (id: string) => void;
  addFiles: (f: FileList | File[], asFolder?: boolean) => void;
  onSubmit: () => void;
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  clearAll: () => void;
  onPreview: (d: Draft) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text, taRef]);

  return (
    <div className="shrink-0 px-6 pb-3 pt-1">
      <div className="mx-auto max-w-3xl">
        <AnimatePresence>
          {drafts.length > 0 && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="mb-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface/70 p-3 backdrop-blur"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-1 px-1">
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  Đang chuẩn bị gửi ({drafts.length} tệp)
                </span>
                <button
                  onClick={clearAll}
                  className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Xoá tất cả
                </button>
              </div>
              <div className="scroll-thin max-h-48 overflow-y-auto flex flex-wrap gap-2 p-1">
                <AnimatePresence initial={false}>
                  {drafts.map((d) => (
                    <DraftChip
                      key={d.id}
                      d={d}
                      onRemove={() => removeDraft(d.id)}
                      onPreview={onPreview}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-end gap-1.5 rounded-[20px] border border-border bg-surface px-1.5 py-1.5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.4)] transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
          <div className="relative">
            <motion.button
              onClick={() => setMenuOpen((o) => !o)}
              whileTap={{ scale: 0.92 }}
              animate={{ rotate: menuOpen ? 45 : 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background text-foreground hover:bg-background/70"
              aria-label="Đính kèm"
            >
              <Plus size={17} />
            </motion.button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl"
                >
                  {[
                    { icon: ImageIcon, label: "Ảnh & video", ref: imgInputRef },
                    { icon: FileText, label: "Tệp tài liệu", ref: fileInputRef },
                    { icon: Folder, label: "Cả thư mục", ref: folderInputRef },
                  ].map((it) => (
                    <button
                      key={it.label}
                      onClick={() => {
                        it.ref.current?.click();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] hover:bg-accent"
                    >
                      <it.icon size={16} className="text-primary" />
                      {it.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={1}
            placeholder="Soạn tin nhắn…"
            className="max-h-28 min-h-[22px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          <motion.button
            onClick={onSubmit}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim() && drafts.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-opacity disabled:opacity-40"
            aria-label="Gửi"
          >
            <Send size={15} className="-translate-x-0.5" />
          </motion.button>
        </div>

        <p className="mt-1.5 px-2 text-center text-[10.5px] text-muted-foreground">
          Enter để gửi · Shift + Enter xuống dòng · Kéo thả file/thư mục
        </p>

        <input
          ref={imgInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error non-standard directory attribute
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files, true)}
        />
      </div>
    </div>
  );
}
