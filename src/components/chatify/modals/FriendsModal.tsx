import { useState } from "react";
import { motion } from "framer-motion";
import { UserPlus, Phone, Video } from "lucide-react";
import type { Friend } from "@/lib/types";
import { UserAvatar } from "../UserAvatar";
import { springSoft as spring } from "@/lib/animation";
import { ModalShell, ModalHeader } from "./ModalShell";

export type { Friend };

export function FriendsModal({
  open,
  onClose,
  friends,
  onCall,
  onAddFriend,
}: {
  open: boolean;
  onClose: () => void;
  friends: Friend[];
  onCall: (f: Friend, kind: "voice" | "video") => void;
  onAddFriend: () => void;
}) {
  const [q, setQ] = useState("");
  const list = friends.filter((f) => f.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <ModalHeader
        title="Bạn bè"
        onClose={onClose}
        extraBtn={
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onAddFriend}
            className="grid h-7 w-7 place-items-center rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            title="Tìm & kết bạn mới"
          >
            <UserPlus size={13} />
          </motion.button>
        }
      />
      <div className="px-5 pt-4">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Tìm bạn bè…"
          className="w-full rounded-full border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
        />
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.04, delayChildren: 0.1 } },
        }}
        className="max-h-[440px] overflow-y-auto p-3"
      >
        {list.map((f) => (
          <motion.div
            key={f.id}
            variants={{
              hidden: { opacity: 0, y: 10 },
              show: { opacity: 1, y: 0, transition: spring },
            }}
            className="group flex items-center gap-3 rounded-2xl px-3 py-2.5 hover:bg-surface-2"
          >
            <div className="relative">
              <UserAvatar
                src={f.avatar}
                name={f.name}
                className="h-11 w-11 rounded-full"
                textClassName="text-sm"
              />
              {f.online && (
                <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-surface bg-emerald-400" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium">{f.name}</div>
              <div className="truncate text-[12px] text-muted-foreground">{f.status}</div>
            </div>
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onCall(f, "voice")}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-foreground hover:bg-primary hover:text-primary-foreground"
              >
                <Phone size={14} />
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => onCall(f, "video")}
                className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-foreground hover:bg-primary hover:text-primary-foreground"
              >
                <Video size={14} />
              </motion.button>
            </div>
          </motion.div>
        ))}
      </motion.div>
    </ModalShell>
  );
}
