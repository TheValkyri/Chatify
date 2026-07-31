import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Mic, MicOff, Video, VideoOff, PhoneOff } from "lucide-react";
import { EASE, springSoft as spring } from "@/lib/animation";

export function CallModal({
  open,
  onClose,
  peer,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  peer: { name: string; avatar: string } | null;
  kind: "voice" | "video";
}) {
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setConnected(false);
      setSeconds(0);
      setMuted(false);
      setCamOff(false);
      return;
    }
    const t = setTimeout(() => setConnected(true), 1600);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <AnimatePresence>
      {open && peer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] grid place-items-center"
        >
          <motion.div
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1.05 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="absolute inset-0"
          >
            <img
              src={peer.avatar}
              alt=""
              className="h-full w-full scale-150 object-cover opacity-30 blur-3xl"
            />
            <div className="absolute inset-0 bg-background/70 backdrop-blur-3xl" />
          </motion.div>
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={spring}
            className="relative flex flex-col items-center gap-6 px-8"
          >
            <div className="text-center">
              <div className="text-[12px] uppercase tracking-[0.24em] text-muted-foreground">
                {kind === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại"}
              </div>
              <div className="mt-2 font-serif-display text-[40px] leading-none">{peer.name}</div>
              <motion.div
                key={connected ? "conn" : "ring"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-[13px] text-muted-foreground"
              >
                {connected ? `${mm}:${ss}` : "Đang kết nối…"}
              </motion.div>
            </div>

            <div className="relative">
              {!connected && (
                <>
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary/30"
                    animate={{ scale: [1, 1.55], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                  />
                </>
              )}
              <motion.img
                src={peer.avatar}
                alt={peer.name}
                animate={connected ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative h-40 w-40 rounded-full object-cover shadow-2xl"
              />
              {kind === "video" && !camOff && connected && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={spring}
                  className="absolute -bottom-2 -right-6 h-20 w-16 overflow-hidden rounded-2xl border-2 border-background bg-surface-2 shadow-xl"
                >
                  <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">
                    Bạn
                  </div>
                </motion.div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <CallBtn
                active={!muted}
                onClick={() => setMuted((m) => !m)}
                icon={muted ? <MicOff size={18} /> : <Mic size={18} />}
              />
              {kind === "video" && (
                <CallBtn
                  active={!camOff}
                  onClick={() => setCamOff((c) => !c)}
                  icon={camOff ? <VideoOff size={18} /> : <Video size={18} />}
                />
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/40"
              >
                <PhoneOff size={20} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CallBtn({
  active,
  onClick,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`grid h-12 w-12 place-items-center rounded-full transition-colors ${
        active ? "bg-surface text-foreground" : "bg-surface-2 text-muted-foreground"
      }`}
    >
      {icon}
    </motion.button>
  );
}
