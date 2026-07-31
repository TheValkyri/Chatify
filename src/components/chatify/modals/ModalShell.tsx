import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { springSoft as spring } from "@/lib/animation";

export function ModalShell({
  open,
  onClose,
  children,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const w = size === "sm" ? "max-w-sm" : size === "lg" ? "max-w-2xl" : "max-w-lg";
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <motion.div
            className="absolute inset-0 bg-background/70 backdrop-blur-xl"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={spring}
            className={`relative w-full ${w} overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl`}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ModalHeader({
  title,
  onClose,
  extraBtn,
}: {
  title: string;
  onClose: () => void;
  extraBtn?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <div className="flex items-center gap-2">
        <div className="text-[15px] font-semibold">{title}</div>
        {extraBtn}
      </div>
      <motion.button
        whileTap={{ scale: 0.92 }}
        onClick={onClose}
        className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
      >
        <X size={16} />
      </motion.button>
    </div>
  );
}
