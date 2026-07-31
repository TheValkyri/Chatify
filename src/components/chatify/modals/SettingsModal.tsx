import { motion } from "framer-motion";
import { Sun, Moon, Palette, Check } from "lucide-react";
import { THEMES, type ThemeDef } from "../themes";
import { springSoft as spring } from "@/lib/animation";
import { ModalShell, ModalHeader } from "./ModalShell";

export function SettingsModal({
  open,
  onClose,
  themeKey,
  mode,
  onThemeChange,
  onModeChange,
}: {
  open: boolean;
  onClose: () => void;
  themeKey: string;
  mode: "dark" | "light";
  onThemeChange: (t: ThemeDef, from: { x: number; y: number }) => void;
  onModeChange: (m: "dark" | "light", from: { x: number; y: number }) => void;
}) {
  return (
    <ModalShell open={open} onClose={onClose}>
      <ModalHeader title="Cài đặt" onClose={onClose} />
      <div className="px-6 py-5">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          className="grid gap-5"
        >
          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            <SectionTitle icon={<Sun size={14} />} label="Chế độ hiển thị" />
            <div className="grid grid-cols-2 gap-2 rounded-2xl bg-surface-2 p-1.5">
              {(["light", "dark"] as const).map((m) => (
                <motion.button
                  key={m}
                  whileTap={{ scale: 0.97 }}
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onModeChange(m, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  }}
                  className={`relative flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors ${
                    mode === m ? "text-primary-foreground" : "text-foreground"
                  }`}
                >
                  {mode === m && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-xl bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative flex items-center gap-2">
                    {m === "light" ? <Sun size={14} /> : <Moon size={14} />}
                    {m === "light" ? "Sáng" : "Tối"}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>

          <motion.div variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}>
            <SectionTitle icon={<Palette size={14} />} label="Bảng màu chủ đề" />
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map((t) => (
                <motion.button
                  key={t.key}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={(e) => {
                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    onThemeChange(t, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                  }}
                  className={`relative overflow-hidden rounded-2xl border p-3 text-left transition-colors ${
                    themeKey === t.key
                      ? "border-primary bg-surface-2"
                      : "border-border bg-surface-2/50 hover:bg-surface-2"
                  }`}
                >
                  <div
                    className="mb-2 h-12 w-full rounded-xl"
                    style={{
                      background: `linear-gradient(135deg, ${t.swatch}, ${t.dark.ambient2})`,
                    }}
                  />
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[12px] font-medium">{t.name}</span>
                    {themeKey === t.key && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={spring}
                        className="grid h-4 w-4 place-items-center rounded-full bg-primary text-primary-foreground"
                      >
                        <Check size={10} strokeWidth={3} />
                      </motion.span>
                    )}
                  </div>
                </motion.button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </ModalShell>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      <span className="text-primary">{icon}</span> {label}
    </div>
  );
}
