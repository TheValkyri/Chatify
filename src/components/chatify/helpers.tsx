import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE } from "@/lib/animation";
import {
  FileText,
  Folder,
  Music,
  X,
  Play,
  Download,
  Loader2,
  CheckCircle2,
  ChevronDown,
  MoreHorizontal,
} from "lucide-react";
import { useUpdateMemberRole, useRemoveMember } from "@/hooks/useConversations";
import { toast } from "sonner";
import {
  downloadFolder,
  downloadAttachment,
  type OriginalFile,
} from "@/lib/file-transfer";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import type {
  Attachment,
  Message,
  Member,
  Draft,
} from "@/lib/types";

type WebkitFileEntry = {
  isFile: true;
  isDirectory: false;
  fullPath: string;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
};

type WebkitDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  createReader: () => {
    readEntries: (
      success: (entries: WebkitEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
};

type WebkitEntry = WebkitFileEntry | WebkitDirectoryEntry;

export function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

export async function getDroppedFiles(items: DataTransferItemList): Promise<OriginalFile[]> {
  const files: OriginalFile[] = [];
  await Promise.all(
    Array.from(items).map(async (item) => {
      const entry = (
        item as DataTransferItem & { webkitGetAsEntry?: () => WebkitEntry | null }
      ).webkitGetAsEntry?.();
      if (entry) {
        // @ts-expect-error — webkitGetAsEntry returns FileSystemEntry which lacks full typing
        await readEntry(entry, files);
        return;
      }
      const file = item.getAsFile();
      if (file) files.push({ file, path: file.name });
    }),
  );
  return files;
}

export function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-4 text-[11px] uppercase tracking-wider text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

export function DraftChip({
  d,
  onRemove,
  onPreview,
}: {
  d: Draft;
  onRemove: () => void;
  onPreview: (d: Draft) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.7, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -10 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      className="group relative overflow-hidden rounded-xl bg-background cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow"
      onClick={() => onPreview(d)}
    >
      {d.kind === "image" && d.url ? (
        <div className="relative h-16 w-24">
          <img src={d.url} alt={d.name} className="h-full w-full object-cover select-none" />
        </div>
      ) : d.kind === "video" && d.url ? (
        <div className="relative h-16 w-24">
          <video src={d.url} className="h-full w-full object-cover select-none" />
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Play size={16} className="fill-white text-white" />
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center gap-2 px-3 pr-8 select-none">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
            {d.kind === "folder" ? (
              <Folder size={16} />
            ) : d.kind === "audio" ? (
              <Music size={16} />
            ) : (
              <FileText size={16} />
            )}
          </div>
          <div className="min-w-0">
            <div className="max-w-[140px] truncate text-[12px] font-medium">{d.name}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {d.meta ? `${d.meta} · ${d.size}` : d.size}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground opacity-90 hover:bg-background"
        aria-label="Xoá đính kèm"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

export function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      animate={{
        scale: focused ? 1.015 : 1,
        borderColor: focused ? "rgba(245, 165, 125, 0.4)" : "rgba(255, 255, 255, 0.08)",
        boxShadow: focused
          ? "0 0 0 4px rgba(245, 165, 125, 0.1), 0 4px 12px rgba(0,0,0,0.1)"
          : "0 0 0 0px rgba(0,0,0,0), 0 2px 4px rgba(0,0,0,0.05)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-2 px-4 py-2"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </motion.div>
  );
}

export function EmptyHint({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
      {text}
    </div>
  );
}

export function MediaGridItem({
  m,
  itemV,
  onPreview,
}: {
  m: Message;
  itemV: { hidden: { opacity: number; scale: number }; show: { opacity: number; scale: number } };
  onPreview: (att: Attachment) => void;
}) {
  const a = m.attachment!;
  const isVideo = a.kind === "video";
  const isMockVideo = a.kind === "video" && !a.source && a.poster?.startsWith("data:");
  const rawSrc =
    a.kind === "image" ? a.url || "" : a.kind === "video" ? a.poster || a.url || "" : "";
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);

  return (
    <motion.div
      variants={itemV}
      whileHover={{ scale: 1.04, y: -2 }}
      onClick={() => onPreview(a)}
      className="aspect-square overflow-hidden rounded-xl bg-surface shadow-sm cursor-pointer relative"
    >
      {a.kind === "image" || isMockVideo ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={refreshSrc} />
      ) : (
        <video
          src={src}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          onError={refreshSrc}
        />
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play size={14} className="fill-white text-white" />
        </div>
      )}
    </motion.div>
  );
}

export function MemberRowActions({
  member,
  convId,
  actorName,
  actorId,
}: {
  member: Member;
  convId: string;
  actorName?: string;
  actorId?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateMemberRoleMutation = useUpdateMemberRole();
  const removeMemberMutation = useRemoveMember();

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const toggleAdmin = () => {
    const newRole = member.role === "admin" ? "member" : "admin";
    updateMemberRoleMutation.mutate({
      convId,
      memberId: member.id,
      role: newRole,
      actorName,
      targetName: member.name,
    });
    setIsOpen(false);
  };

  const kickMember = () => {
    removeMemberMutation.mutate({
      convId,
      memberId: member.id,
      currentUserId: actorId,
      actorName,
      targetName: member.name,
    });
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative ml-auto">
      <motion.button
        type="button"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.85 }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
      >
        <MoreHorizontal size={14} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleAdmin();
              }}
              className="flex w-full items-center px-3 py-2 text-[12px] text-left hover:bg-surface-2 transition-colors text-foreground"
            >
              {member.role === "admin" ? "Bãi nhiệm phó nhóm" : "Bổ nhiệm phó nhóm"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                kickMember();
              }}
              className="flex w-full items-center px-3 py-2 text-[12px] text-left hover:bg-surface-2 transition-colors text-destructive"
            >
              Xoá khỏi nhóm
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function AttachmentView({
  att,
  isMe,
  onPreview,
  status,
}: {
  att: Attachment;
  isMe: boolean;
  onPreview: (att: Attachment) => void;
  status?: string;
}) {
  if (att.kind === "image" || att.kind === "video") {
    return <TicketStub att={att} onPreview={onPreview} status={status} />;
  }
  if (
    att.kind === "audio" ||
    (att.kind === "file" && /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(att.name))
  ) {
    return <AudioPlayerCard att={att} isMe={isMe} status={status} />;
  }
  if (att.kind === "folder") {
    return <FolderCard att={att} status={status} />;
  }
  return <FileCard att={att} isMe={isMe} status={status} />;
}

export function AudioPlayerCard({
  att,
  isMe,
  status,
}: {
  att: Attachment;
  isMe: boolean;
  status?: string;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isUploading =
    status === "sending" || (att.uploadProgress !== undefined && att.uploadProgress < 100);
  const progress = att.uploadProgress ?? 0;
  const { url: src } = useAttachmentUrl(att.url);

  const togglePlay = () => {
    if (isUploading || !audioRef.current || !src) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((e) => console.error("Audio play error:", e));
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current && audioRef.current.duration) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (isUploading || !audioRef.current || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const fmtTime = (secs: number) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const barHeights = [
    40, 65, 30, 85, 45, 95, 60, 35, 75, 50, 90, 40, 70, 80, 45, 100, 55, 35, 80, 60, 40, 75, 30, 50,
  ];

  const progressRatio = duration > 0 ? currentTime / duration : 0;
  const activeBarIndex = Math.floor(progressRatio * barHeights.length);

  return (
    <motion.div
      whileHover={isUploading ? {} : { y: -1 }}
      className={`flex flex-col w-[320px] rounded-2xl p-3.5 shadow-md border ${
        isMe
          ? "bg-primary text-primary-foreground border-primary/20"
          : "bg-surface text-foreground border-border"
      }`}
    >
      {src && (
        <audio
          ref={audioRef}
          src={src}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleEnded}
          preload="metadata"
        />
      )}

      <div className="flex items-center gap-3">
        {/* Play / Pause round button */}
        <motion.button
          whileHover={isUploading ? {} : { scale: 1.06 }}
          whileTap={isUploading ? {} : { scale: 0.92 }}
          disabled={isUploading || !src}
          onClick={togglePlay}
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-full shadow-md transition-colors ${
            isUploading
              ? "bg-muted text-muted-foreground cursor-not-allowed"
              : isMe
                ? "bg-white text-primary hover:bg-white/90"
                : "bg-primary text-primary-foreground hover:bg-primary/90"
          }`}
          aria-label={isPlaying ? "Tạm dừng" : "Phát âm thanh"}
        >
          {isPlaying ? (
            <span className="flex gap-1 items-center justify-center">
              <span className="w-1.5 h-4 bg-current rounded-full" />
              <span className="w-1.5 h-4 bg-current rounded-full" />
            </span>
          ) : (
            <Play size={18} className="translate-x-0.5 fill-current" />
          )}
        </motion.button>

        {/* Name, time counter & waveform */}
        <div className="min-w-0 flex-1 flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[13px] font-semibold leading-tight">{att.name}</span>
            <span className="shrink-0 font-mono text-[10.5px] opacity-80">
              {duration > 0 ? fmtTime(currentTime) : att.size}
            </span>
          </div>

          {/* Interactive Waveform Bars */}
          {isUploading ? (
            <div className="w-full">
              <div className="flex justify-between text-[10.5px] font-semibold mb-1 opacity-90">
                <span>Đang tải lên...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-black/20 overflow-hidden">
                <div
                  className="h-full bg-current transition-all duration-150 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div
              onClick={handleSeek}
              className="flex items-center gap-[2.5px] h-6 w-full cursor-pointer group py-1"
              title="Click để chuyển tới đoạn nhạc"
            >
              {barHeights.map((h, i) => {
                const isActive = i <= activeBarIndex;
                return (
                  <motion.span
                    key={i}
                    animate={isPlaying && isActive ? { scaleY: [1, 1.25, 0.8, 1] } : { scaleY: 1 }}
                    transition={{
                      repeat: Infinity,
                      duration: 0.6,
                      delay: (i % 4) * 0.1,
                    }}
                    style={{ height: `${h}%` }}
                    className={`flex-1 rounded-full transition-colors ${
                      isActive
                        ? isMe
                          ? "bg-white"
                          : "bg-primary"
                        : isMe
                          ? "bg-white/30"
                          : "bg-muted-foreground/30 group-hover:bg-muted-foreground/50"
                    }`}
                  />
                );
              })}
            </div>
          )}
        </div>

        {/* Download Button */}
        {!isUploading && (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await downloadAttachment(att);
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
              }
            }}
            title="Tải tệp âm thanh gốc"
            className={`grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors ${
              isMe
                ? "text-white/80 hover:bg-white/20 hover:text-white"
                : "text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            }`}
          >
            <Download size={15} />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

export async function readEntry(entry: WebkitEntry, files: OriginalFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    files.push({ file, path: entry.fullPath.replace(/^\/+/, "") || file.name });
    return;
  }

  const reader = entry.createReader();
  while (true) {
    const entries = await new Promise<WebkitEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!entries.length) return;
    await Promise.all(entries.map((child) => readEntry(child, files)));
  }
}

export function TicketStub({
  att,
  onPreview,
  status,
}: {
  att: Extract<Attachment, { kind: "image" | "video" }>;
  onPreview: (att: Attachment) => void;
  status?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const [autoPoster, setAutoPoster] = useState<string>("");
  const isUploading =
    status === "sending" || (att.uploadProgress !== undefined && att.uploadProgress < 100);
  const progress = att.uploadProgress ?? 0;
  const attPoster = att.kind === "video" ? att.poster : undefined;
  const isMockVideo = att.kind === "video" && !att.source && attPoster?.startsWith("data:");
  const rawSrc = att.kind === "image" ? att.url || "" : att.url || attPoster || "";
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);
  const { url: posterSrc } = useAttachmentUrl(attPoster);

  // Dynamic highlight thumbnail extraction for videos without poster
  useEffect(() => {
    if (att.kind === "video" && !attPoster && src && !src.startsWith("gdrive://")) {
      let active = true;
      import("@/lib/video-thumbnail").then(({ generateVideoThumbnail }) => {
        generateVideoThumbnail(src, 2)
          .then((thumb) => {
            if (active && thumb) setAutoPoster(thumb);
          })
          .catch(() => {});
      });
      return () => {
        active = false;
      };
    }
  }, [att.kind, attPoster, src]);

  const durationText =
    att.kind === "video" && att.duration && att.duration !== "—" ? att.duration : "Video";
  const meta =
    att.kind === "image" ? `${att.dims || "Ảnh"} · ${att.size}` : `${durationText} · ${att.size}`;

  const videoPosterImage = posterSrc || autoPoster;

  return (
    <motion.div
      whileHover={isUploading ? {} : { y: -2 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="w-[380px] overflow-hidden rounded-[22px] bg-surface shadow-xl shadow-black/20"
    >
      <div
        className={`relative h-56 w-full overflow-hidden bg-muted ${
          isUploading ? "cursor-not-allowed" : "cursor-pointer"
        }`}
        onClick={() => {
          if (!isUploading) onPreview(att);
        }}
      >
        {att.kind === "image" ? (
          <img
            src={src}
            alt={att.name}
            className="h-full w-full object-cover"
            onError={refreshSrc}
          />
        ) : isMockVideo || videoPosterImage ? (
          <img
            src={videoPosterImage || src}
            alt={att.name}
            className="h-full w-full object-cover"
            onError={refreshSrc}
          />
        ) : (
          <video
            src={src}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            playsInline
            onError={refreshSrc}
          />
        )}
        {att.kind === "video" && !isUploading && (
          <div className="absolute inset-0 grid place-items-center bg-black/10">
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="grid h-14 w-14 place-items-center rounded-full bg-background/85 backdrop-blur"
            >
              <Play size={22} className="translate-x-0.5 fill-foreground text-foreground" />
            </motion.div>
          </div>
        )}

        {/* Real Progress Bar & Locking Overlay */}
        {isUploading && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-xs p-4 text-white select-none">
            <div className="text-[13px] font-semibold mb-2 flex items-center gap-1.5">
              <span>Đang gửi tệp...</span>
              <span className="font-mono text-primary font-bold">{progress}%</span>
            </div>
            <div className="w-52 h-2 rounded-full bg-white/20 overflow-hidden shadow-inner">
              <div
                className="h-full bg-primary transition-all duration-200 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <div className="text-[11px] text-white/70 mt-2">Đang tải dữ liệu lên server</div>
          </div>
        )}
      </div>

      <div className="ticket-perf h-3.5" />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{att.name}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {isUploading
              ? `Đang tải lên... ${progress}%`
              : att.url && !att.url.startsWith("blob:")
                ? "Đã lưu trên máy chủ"
                : att.source
                  ? "Bản gốc (phiên này)"
                  : "Tệp mẫu"}{" "}
            · {meta}
          </div>
        </div>
        <motion.button
          whileHover={isUploading || downloading ? {} : { scale: 1.05 }}
          whileTap={isUploading || downloading ? {} : { scale: 0.94 }}
          disabled={isUploading || downloading}
          onClick={async () => {
            if (isUploading || downloading) return;
            setDownloading(true);
            try {
              await downloadAttachment(att);
              toast.success(`Đã tải xuống "${att.name}"`, {
                icon: <CheckCircle2 size={16} />,
                duration: 3000,
              });
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
            } finally {
              setDownloading(false);
            }
          }}
          title={
            isUploading
              ? "Đang tải lên server, chưa thể tải về"
              : downloading
                ? "Đang tải xuống..."
                : "Tải tệp gốc"
          }
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-medium transition-all duration-200 ${
            isUploading || downloading
              ? "bg-muted text-muted-foreground cursor-not-allowed opacity-60"
              : "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
          }`}
        >
          {downloading ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Đang tải...
            </>
          ) : isUploading ? (
            <>
              <Download size={14} /> Đang gửi...
            </>
          ) : (
            <>
              <Download size={14} /> Tải gốc
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

export function FolderCard({
  att,
  status,
}: {
  att: Extract<Attachment, { kind: "folder" }>;
  status?: string;
}) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const isUploading =
    status === "sending" || (att.uploadProgress !== undefined && att.uploadProgress < 100);
  const progress = att.uploadProgress ?? 0;

  const handleDownload = async () => {
    if (isUploading) return;
    setDownloading(true);
    setDownloadError("");
    try {
      if (att.sourceFiles?.length) {
        await downloadFolder(att.sourceFiles, att.name);
      } else if (att.url) {
        await downloadAttachment(att);
      } else {
        setDownloadError(
          "Thư mục này không còn khả dụng để tải (dữ liệu gốc đã mất sau khi tải lại trang).",
        );
        return;
      }
      toast.success(`Đã tải xuống "${att.name}"`, {
        icon: <CheckCircle2 size={16} />,
        duration: 3000,
      });
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Không thể tạo tệp ZIP.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div layout className="w-[380px] overflow-hidden rounded-[22px] bg-surface">
      <button
        onClick={() => !isUploading && setOpen((o) => !o)}
        disabled={isUploading}
        className={`flex w-full items-center gap-3 px-3.5 py-3 text-left ${
          isUploading ? "cursor-not-allowed" : ""
        }`}
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
          <Folder size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{att.name}</div>
          {isUploading ? (
            <div className="w-full mt-1 pr-2">
              <div className="flex justify-between text-[11px] font-semibold text-primary mb-1">
                <span>Đang tải lên...</span>
                <span className="font-mono">{progress}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-primary/20 overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-200 rounded-full"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {att.files} tệp · {att.size}
            </div>
          )}
        </div>
        {!isUploading && (
          <motion.div
            animate={{ rotate: open ? 180 : 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <ChevronDown size={18} className="text-muted-foreground" />
          </motion.div>
        )}
      </button>
      <AnimatePresence initial={false}>
        {open && !isUploading && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-2 py-2">
              {att.children.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] hover:bg-background/50"
                >
                  <span className="truncate text-foreground/90">{c.name}</span>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground">{c.size}</span>
                </div>
              ))}
              <button
                onClick={handleDownload}
                disabled={downloading || isUploading}
                title="Tạo ZIP không nén từ các tệp gốc"
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50"
              >
                <Download size={13} /> {downloading ? "Đang chuẩn bị…" : "Tải cả thư mục"}
              </button>
              {downloadError && (
                <p role="alert" className="px-3 pb-1 text-[11px] text-destructive">
                  {downloadError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function FileCard({
  att,
  isMe,
  status,
}: {
  att: Extract<Attachment, { kind: "file" }>;
  isMe: boolean;
  status?: string;
}) {
  const [downloading, setDownloading] = useState(false);
  const isUploading =
    status === "sending" || (att.uploadProgress !== undefined && att.uploadProgress < 100);
  const progress = att.uploadProgress ?? 0;

  return (
    <motion.div
      whileHover={isUploading ? {} : { y: -1 }}
      className={`flex w-[340px] items-center gap-3 rounded-2xl px-3.5 py-3 ${
        isMe ? "bg-primary/15" : "bg-surface"
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
        <FileText size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">{att.name}</div>
        {isUploading ? (
          <div className="w-full mt-1">
            <div className="flex justify-between text-[11px] font-semibold text-primary mb-1">
              <span>Đang tải lên...</span>
              <span className="font-mono">{progress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-primary/20 overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-200 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-0.5 text-[11.5px] uppercase tracking-wider text-muted-foreground">
            {att.ext} · {att.size}
          </div>
        )}
      </div>
      <motion.button
        whileTap={isUploading || downloading ? {} : { scale: 0.9 }}
        disabled={isUploading || downloading}
        onClick={async () => {
          if (isUploading || downloading) return;
          setDownloading(true);
          try {
            await downloadAttachment(att);
            toast.success(`Đã tải xuống "${att.name}"`, {
              icon: <CheckCircle2 size={16} />,
              duration: 3000,
            });
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
          } finally {
            setDownloading(false);
          }
        }}
        title={
          isUploading
            ? "Đang tải lên server, chưa thể tải về"
            : downloading
              ? "Đang tải xuống..."
              : "Tải tệp gốc"
        }
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full transition-all duration-200 ${
          isUploading || downloading
            ? "text-muted-foreground/40 cursor-not-allowed"
            : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
        }`}
        aria-label="Tải"
      >
        {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </motion.button>
    </motion.div>
  );
}
