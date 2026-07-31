import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { springSoft, springSidebar } from "@/lib/animation";
import { Search, Plus } from "lucide-react";
import type { Conversation } from "@/lib/types";
import { UserAvatar } from "./UserAvatar";

export function Sidebar({
  convs,
  activeId,
  onSelect,
  onCreateChat,
}: {
  convs: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreateChat: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(
    () =>
      (Array.isArray(convs) ? convs : [])
        .filter((c) => c && c.name)
        .filter((c) => c.name.toLowerCase().includes(q.toLowerCase())),
    [q, convs],
  );
  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 340, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={springSidebar}
      className="relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-background/55 backdrop-blur-xl"
    >
      <div className="flex w-[340px] min-w-[340px] flex-col h-full">
        <div className="px-5 pb-3 pt-6 flex items-center justify-between">
          <div>
            <h1
              className="font-serif-display text-[26px] leading-none tracking-tight"
              style={{ color: "var(--foreground)" }}
            >
              Tin nhắn<span style={{ color: "var(--primary)" }}>.</span>
            </h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {convs.filter(Boolean).reduce((s, c) => s + (c.unread ?? 0), 0)} tin chưa đọc
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onCreateChat}
            className="grid h-8 w-8 place-items-center rounded-xl bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Tạo cuộc hội thoại mới"
          >
            <Plus size={16} />
          </motion.button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2.5">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm hội thoại"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.04, delayChildren: 0.05 } },
          }}
          className="scroll-thin flex-1 overflow-y-auto px-2 pb-4"
        >
          {list.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-muted-foreground">
              {q
                ? "Không tìm thấy hội thoại phù hợp."
                : "Chưa có hội thoại nào. Nhấn nút + để tạo."}
            </div>
          ) : (
            list.map((c) => {
              const isActive = c.id === activeId;
              const idStr = String(c.id);
              const isNewlyCreated =
                (idStr.startsWith("") || idStr.startsWith("")) &&
                Date.now() - Number(idStr.split("_")[1]) < 3000;

              const entryVariant = isNewlyCreated
                ? {
                    hidden: { opacity: 0, scale: 0.5, y: 15 },
                    show: {
                      opacity: 1,
                      scale: [0.5, 1.15, 1] as unknown as number,
                      y: 0,
                      transition: {
                        type: "spring" as const,
                        stiffness: 420,
                        damping: 14,
                        duration: 0.6,
                      },
                    },
                  }
                : {
                    hidden: { opacity: 0, y: 10 },
                    show: { opacity: 1, y: 0, transition: springSoft },
                  };

              return (
                <motion.button
                  key={c.id}
                  variants={entryVariant}
                  onClick={() => onSelect(c.id)}
                  whileTap={{ scale: 0.985 }}
                  whileHover={{ x: 2 }}
                  className={`relative flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors ${
                    isActive ? "bg-surface" : "hover:bg-surface/60"
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="sidebar-active"
                      className="absolute left-1 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-full bg-primary"
                      transition={{ type: "spring", stiffness: 400, damping: 32 }}
                    />
                  )}
                  <div className="relative">
                    <UserAvatar
                      src={c.avatar}
                      name={c.name}
                      className="h-12 w-12 rounded-full"
                      textClassName="text-sm"
                    />
                    {c.presence === "online" && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-emerald-400" />
                    )}
                    {c.presence === "away" && (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-amber-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-[14.5px] font-medium">{c.name}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{c.time}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="truncate text-[13px] text-muted-foreground">
                        {c.preview}
                      </span>
                      {c.unread > 0 && (
                        <span className="grid h-5 min-w-[20px] shrink-0 place-items-center rounded-full bg-primary px-1.5 text-[11px] font-semibold text-primary-foreground">
                          {c.unread}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.button>
              );
            })
          )}
        </motion.div>
      </div>
    </motion.aside>
  );
}
