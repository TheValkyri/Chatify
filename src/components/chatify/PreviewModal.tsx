import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Download,
  Loader2,
  CheckCircle2,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
} from "lucide-react";
import { toast } from "sonner";
import { downloadAttachment } from "@/lib/file-transfer";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import type { Attachment } from "@/lib/types";

// Helper to format seconds into mm:ss or hh:mm:ss
function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── High Performance Custom Video Player Component ─────────────────────────

function CustomVideoPlayer({
  src,
  posterSrc,
  onError,
}: {
  src: string;
  posterSrc?: string;
  name: string;
  onError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Hover preview tooltip state for scrubbing (single stream, 0 extra network requests)
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState(0);

  const controlsTimeoutRef = useRef<number | null>(null);
  const bufferTimerRef = useRef<number | null>(null);

  // AutoPlay when video source or metadata is ready
  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      setIsLoaded(true);
      setIsBuffering(false);
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Only show buffering spinner if video stalls for > 800ms (prevents spinner flashing)
  const handleWaiting = () => {
    if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
    bufferTimerRef.current = window.setTimeout(() => {
      setIsBuffering(true);
    }, 800);
  };

  const handlePlaying = () => {
    if (bufferTimerRef.current) window.clearTimeout(bufferTimerRef.current);
    setIsBuffering(false);
    setIsPlaying(true);
  };

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current
        .play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    }
  }, [isPlaying]);

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (videoRef.current) {
      videoRef.current.volume = val;
      videoRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  // Auto-hide controls on mouse idle
  const handleMouseMoveContainer = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) window.clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = window.setTimeout(() => {
      if (isPlaying) setShowControls(false);
    }, 3000);
  };

  // Seek Bar Hover Handler (Zero network overhead, 60fps smooth)
  const handleSeekBarMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || duration <= 0) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = offsetX / rect.width;
    const time = percent * duration;

    setHoverX(offsetX);
    setHoverTime(time);
  };

  const handleSeekBarMouseLeave = () => {
    setHoverTime(null);
  };

  const handleSeekBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!seekBarRef.current || !videoRef.current || duration <= 0) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const offsetX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const percent = offsetX / rect.width;
    const targetTime = percent * duration;

    videoRef.current.currentTime = targetTime;
    setCurrentTime(targetTime);
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMoveContainer}
      className="relative flex flex-col items-center justify-center max-h-[80vh] max-w-[90vw] overflow-hidden rounded-2xl bg-black shadow-2xl group select-none"
    >
      {/* Primary Single Video Element (100% network bandwidth allocated) */}
      <video
        ref={videoRef}
        src={src}
        poster={posterSrc || undefined}
        className="max-h-[75vh] max-w-[90vw] object-contain cursor-pointer"
        onClick={togglePlay}
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={handleTimeUpdate}
        onWaiting={handleWaiting}
        onCanPlay={handlePlaying}
        onPlaying={handlePlaying}
        onEnded={() => setIsPlaying(false)}
        onError={onError}
        preload="auto"
        playsInline
      />

      {/* Loading Overlay (Only shown if metadata loading or genuine >800ms network stall) */}
      {(!isLoaded || isBuffering) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs z-10 pointer-events-none">
          <Loader2 size={44} className="animate-spin text-primary mb-3" />
          <div className="text-sm font-medium text-white/90">Đang tải video...</div>
        </div>
      )}

      {/* Center Play/Pause Overlay Icon when paused */}
      {!isPlaying && isLoaded && !isBuffering && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 grid place-items-center bg-black/20 cursor-pointer z-10"
        >
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="grid h-16 w-16 place-items-center rounded-full bg-background/90 text-foreground backdrop-blur shadow-2xl"
          >
            <Play size={28} className="translate-x-0.5 fill-foreground" />
          </motion.div>
        </div>
      )}

      {/* Custom Modern Video Controls Bar */}
      <AnimatePresence>
        {(showControls || !isPlaying) && isLoaded && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.2 }}
            className="absolute bottom-0 left-0 right-0 z-20 flex flex-col gap-2 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-4 text-white"
          >
            {/* Interactive Seek Bar with Smooth Tooltip Badge */}
            <div
              ref={seekBarRef}
              onMouseMove={handleSeekBarMouseMove}
              onMouseLeave={handleSeekBarMouseLeave}
              onClick={handleSeekBarClick}
              className="relative flex h-4 w-full cursor-pointer items-center py-1 group/bar"
            >
              {/* Floating Mini Hover Tooltip (Timestamp + Poster Badge, 0 Network Overhead) */}
              {hoverTime !== null && (
                <div
                  className="absolute bottom-7 -translate-x-1/2 flex flex-col items-center pointer-events-none z-30"
                  style={{ left: `${hoverX}px` }}
                >
                  <div className="overflow-hidden rounded-lg border border-white/20 bg-black/90 px-2.5 py-1.5 shadow-2xl backdrop-blur flex items-center gap-2">
                    {posterSrc && (
                      <img
                        src={posterSrc}
                        alt=""
                        className="h-9 w-16 rounded object-cover border border-white/10"
                      />
                    )}
                    <span className="font-mono text-xs font-bold text-primary">
                      {formatTime(hoverTime)}
                    </span>
                  </div>
                </div>
              )}

              {/* Seek Bar Background Track */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/30 transition-all group-hover/bar:h-2">
                {/* Progress Fill */}
                <div
                  className="h-full bg-primary transition-all duration-75"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              {/* Scrubber Knob */}
              <div
                className="absolute h-3.5 w-3.5 -translate-x-1/2 rounded-full bg-white shadow-lg transition-transform group-hover/bar:scale-125"
                style={{ left: `${progressPercent}%` }}
              />
            </div>

            {/* Bottom Controls Buttons */}
            <div className="flex items-center justify-between text-xs font-medium">
              <div className="flex items-center gap-4">
                {/* Play / Pause */}
                <button
                  onClick={togglePlay}
                  className="p-1 text-white/90 hover:text-white transition-colors"
                  aria-label={isPlaying ? "Tạm dừng" : "Phát"}
                >
                  {isPlaying ? (
                    <Pause size={18} className="fill-current" />
                  ) : (
                    <Play size={18} className="fill-current" />
                  )}
                </button>

                {/* Timestamp counter */}
                <div className="font-mono text-white/90">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-4">
                {/* Volume Control */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleMute}
                    className="p-1 text-white/90 hover:text-white transition-colors"
                  >
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-16 accent-primary cursor-pointer h-1"
                  />
                </div>

                {/* Fullscreen Toggle */}
                <button
                  onClick={toggleFullscreen}
                  className="p-1 text-white/90 hover:text-white transition-colors"
                  aria-label="Toàn màn hình"
                >
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Preview Modal Component ───────────────────────────────────────────

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
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!open) setDownloading(false);
  }, [open]);

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

  const handleDownload = async () => {
    if (!att || downloading) return;
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
  };

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

          {/* Media Container */}
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
              <CustomVideoPlayer
                src={src}
                posterSrc={posterSrc || undefined}
                name={att.name}
                onError={refreshSrc}
              />
            ) : att.kind === "audio" || /\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(att.name) ? (
              <div className="p-8 bg-surface rounded-2xl text-foreground text-center shadow-2xl flex flex-col items-center gap-4 min-w-[320px]">
                <div className="font-semibold text-lg">{att.name}</div>
                <audio src={src} controls className="w-full max-w-md" autoPlay />
              </div>
            ) : (
              <div className="p-8 bg-surface rounded-2xl text-foreground text-center">
                <div className="font-semibold">{att.name}</div>
                <div className="text-sm text-muted-foreground mt-1">{metaText}</div>
              </div>
            )}
          </div>

          {/* Media Info & Download Button */}
          <div
            onClick={(e) => e.stopPropagation()}
            className="mt-6 flex flex-col items-center text-center text-white cursor-default"
          >
            <div className="text-lg font-semibold">{att.name}</div>
            <div className="mt-1 text-sm text-white/60">{metaText}</div>
            <motion.button
              whileHover={downloading ? {} : { scale: 1.05 }}
              whileTap={downloading ? {} : { scale: 0.95 }}
              disabled={downloading}
              onClick={handleDownload}
              className={`mt-4 flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold shadow-lg transition-all duration-200 ${
                downloading
                  ? "bg-primary/70 text-primary-foreground/80 cursor-wait"
                  : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {downloading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Đang tải xuống...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Tải chất lượng gốc
                </>
              )}
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
