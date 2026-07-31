import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/animation";

export function LiquidTransition({
  pulse,
}: {
  pulse: { key: number; color: string; x: number; y: number } | null;
}) {
  return (
    <AnimatePresence>
      {pulse && (
        <motion.div key={pulse.key} className="pointer-events-none fixed inset-0 z-[60]">
          <motion.div
            initial={{ scale: 0, opacity: 0.85 }}
            animate={{ scale: 40, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
            className="absolute h-40 w-40 rounded-full blur-3xl"
            style={{
              left: pulse.x - 80,
              top: pulse.y - 80,
              background: `radial-gradient(circle, ${pulse.color} 0%, transparent 70%)`,
            }}
          />
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.35, 0] }}
            transition={{ duration: 0.9, ease: EASE }}
            className="absolute inset-0"
            style={{
              background: `radial-gradient(circle at ${pulse.x}px ${pulse.y}px, ${pulse.color}44, transparent 60%)`,
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
