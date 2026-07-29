import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download } from "lucide-react";
import { toast } from "sonner";
import { downloadAttachment } from "@/lib/file-transfer";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import type { Attachment } from "@/lib/types";

export function PreviewModal({
  open,
  onClose,
  att,
}: {
  open: boolean;
  onClose: () => void;
  att: Attachment | null;
}) {
  const isImage = att?.kind === "image";
  const isVideo = att?.kind === "video";
  const rawSrc = att?.url;
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);
  const { url: posterSrc } = useAttachmentUrl(isVideo ? att?.poster : undefined);

  // Close modal when pressing ESC
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const metaText = att
    ? att.kind === "image"
      ? `${att.dims || "Ảnh"} · ${att.size}`
      : att.kind === "video"
        ? `${att.duration && att.duration !== "—" ? att.duration : "Video"} · ${att.size}`
        : att.size
    : "";

  return (
    <AnimatePresence>
      {open && att && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md cursor-pointer"
        >
          {/* Top-right close button */}
          <button
            onClick={onClose}
            className="absolute right-6 top-6 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors z-10"
            aria-label="Đóng"
          >
            <X size={24} />
          </button>

          {/* Media Container (Stop click propagation so clicking media doesn't close modal) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[80vh] max-w-[90vw] overflow-hidden rounded-2xl flex items-center justify-center cursor-default"
          >
            {isImage ? (
              <img
                src={src}
                alt={att.name}
                className="max-h-[80vh] max-w-[90vw] object-contain select-none shadow-2xl rounded-2xl"
                onError={refreshSrc}
              />
            ) : isVideo ? (
              <video
                src={src}
                poster={posterSrc || undefined}
                className="max-h-[80vh] max-w-[90vw] object-contain shadow-2xl rounded-2xl"
                controls
                autoPlay={false}
                preload="metadata"
                playsInline
                onError={refreshSrc}
              />
            ) : att.kind === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(att.name) ? (
              <div className="p-8 bg-surface rounded-2xl text-foreground text-center shadow-2xl flex flex-col items-center gap-4 min-w-[320px]">
                <div className="font-semibold text-lg">{att.name}</div>
                <audio src={src} controls className="w-full max-w-md" autoPlay={false} />
              </div>
            ) : (
              <div className="p-8 bg-surface rounded-2xl text-foreground text-center">
                <div className="font-semibold">{att.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{metaText}</div>
              </div>
            )}
          </div>

          {/* Media Info & Download Button (Stop propagation) */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-6 flex flex-col items-center text-center text-white cursor-default"
          >
            <div className="text-lg font-semibold">{att.name}</div>
            <div className="mt-1 text-sm text-white/60">{metaText}</div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await downloadAttachment(att);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
                }
              }}
              className="mt-4 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
            >
              <Download size={16} /> Tải chất lượng gốc
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
