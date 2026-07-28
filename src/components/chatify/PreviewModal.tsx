import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { EASE, springSoft, springSidebar } from '@/lib/animation';
import { Search, Phone, Video, Info, Plus, Image as ImageIcon, FileText, Folder, Paperclip, Send, X, Play, Download, ChevronDown, MessageSquare, Users, Settings, Bell, Check, CheckCheck, LogOut, PanelLeftClose, PanelLeft, UserPlus, MoreHorizontal } from 'lucide-react';
import { STORAGE_KEYS } from '@/lib/config';
import { toast } from 'sonner';
import { downloadFile, downloadFolder, downloadAttachment, zipFolderToBlob, type OriginalFile } from '@/lib/file-transfer';
import { buildAttachment, uploadFile } from '@/lib/upload';
import { useAttachmentUrl } from '@/hooks/useAttachmentUrl';
import type { Attachment, Message, Conversation, Member, Notification, Friend, Profile, AuthUser, Draft } from '@/lib/types';
import { LiquidTransition } from './Modals';

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
  const rawSrc = isImage ? att?.url : att?.kind === "video" ? att?.poster || att?.url : undefined;
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);

  return (
    <AnimatePresence>
      {open && att && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        >
          <button
            onClick={onClose}
            className="absolute right-6 top-6 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Đóng"
          >
            <X size={24} />
          </button>

          <div className="relative max-h-[80vh] max-w-[90vw] overflow-hidden rounded-2xl flex items-center justify-center">
            {isImage ? (
              <img
                src={src}
                alt={att.name}
                className="max-h-[80vh] max-w-[90vw] object-contain select-none shadow-2xl"
                onError={refreshSrc}
              />
            ) : isVideo ? (
              <video
                src={src}
                className="max-h-[80vh] max-w-[90vw] object-contain"
                controls
                autoPlay
                preload="metadata"
                onError={refreshSrc}
              />
            ) : null}
          </div>

          <div className="mt-6 flex flex-col items-center text-center text-white">
            <div className="text-lg font-semibold">{att.name}</div>
            <div className="mt-1 text-sm text-white/60">
              {att.kind === "image"
                ? `${att.dims} · ${att.size}`
                : att.kind === "video"
                  ? `${att.duration} · ${att.size}`
                  : att.size}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                try {
                  await downloadAttachment(att);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
                }
              }}
              className="mt-4 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg"
            >
              <Download size={16} /> Tải chất lượng gốc
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
