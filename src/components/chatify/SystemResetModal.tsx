import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { RefreshCw, Sparkles, LogOut } from "lucide-react";

interface SystemResetModalProps {
  isOpen: boolean;
  onRedirect: () => void;
  title?: string;
  description?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

export function SystemResetModal({
  isOpen,
  onRedirect,
  title = "Hệ thống đã reset dữ liệu",
  description = "Toàn bộ tài khoản và dữ liệu ứng dụng đã được dọn dẹp sạch trên Backend. Đang tự động chuyển mượt sang trang Đăng nhập / Tạo tài khoản...",
}: SystemResetModalProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }

    // Smooth progress animation over 2.5s
    const startTime = Date.now();
    const duration = 2500;

    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / duration) * 100);
      setProgress(pct);

      if (pct >= 100) {
        clearInterval(interval);
        setTimeout(onRedirect, 200);
      }
    }, 30);

    return () => clearInterval(interval);
  }, [isOpen, onRedirect]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6">
          {/* Backdrop Blur & Fade */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: "easeInOut" }}
            className="absolute inset-0 bg-[#0d0907]/80 backdrop-blur-xl"
          />

          {/* Glowing background ambient light */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0.25 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="pointer-events-none absolute h-96 w-96 rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(245,165,125,0.6) 0%, rgba(245,165,125,0) 70%)",
            }}
          />

          {/* Modal Container */}
          <motion.div
            initial={{ scale: 0.82, opacity: 0, y: 24 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: -20, filter: "blur(10px)" }}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative w-full max-w-[440px] overflow-hidden rounded-[28px] border p-7 text-center shadow-2xl backdrop-blur-2xl"
            style={{
              backgroundColor: "rgba(24, 18, 14, 0.94)",
              borderColor: "rgba(245, 165, 125, 0.25)",
              boxShadow: "0 35px 90px -20px rgba(0,0,0,0.85), 0 0 40px -10px rgba(245,165,125,0.2)",
            }}
          >
            {/* Animated Icon */}
            <div
              className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border bg-gradient-to-b from-[#2a1b13] to-[#1a110b]"
              style={{ borderColor: "rgba(245, 165, 125, 0.3)" }}
            >
              <motion.div
                animate={{ rotate: [0, 180, 360] }}
                transition={{ duration: 4, repeat: Infinity, ease: "linear" }}
                className="text-[#f5a57d]"
              >
                <RefreshCw size={28} />
              </motion.div>
            </div>

            {/* Sparkle badge */}
            <div
              className="mb-2 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#f5a57d]"
              style={{
                backgroundColor: "rgba(245,165,125,0.1)",
                borderColor: "rgba(245,165,125,0.25)",
              }}
            >
              <Sparkles size={12} />
              <span>Hệ thống Reset</span>
            </div>

            {/* Title & Description */}
            <h2
              className="mb-2 text-[22px] font-bold text-[#f6ecdf]"
              style={{ fontFamily: "'Instrument Serif', serif" }}
            >
              {title}
            </h2>
            <p className="mb-6 text-[13.5px] leading-relaxed text-[#a89b8c]">{description}</p>

            {/* Progress Bar Container */}
            <div className="relative mb-6 h-2 w-full overflow-hidden rounded-full bg-[#1e1712]">
              <motion.div
                className="h-full rounded-full"
                style={{
                  backgroundColor: "#f5a57d",
                  boxShadow: "0 0 12px rgba(245, 165, 125, 0.8)",
                  width: `${progress}%`,
                }}
              />
            </div>

            {/* Manual Action Button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onRedirect}
              className="flex w-full items-center justify-center gap-2 rounded-full py-3.5 text-[14px] font-semibold transition-all"
              style={{
                backgroundColor: "#f5a57d",
                color: "#2a170c",
                boxShadow: "0 10px 30px -10px rgba(245,165,125,0.5)",
              }}
            >
              <LogOut size={16} />
              <span>Chuyển sang Đăng nhập ngay</span>
            </motion.button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
