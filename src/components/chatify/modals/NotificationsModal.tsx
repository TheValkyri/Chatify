import { motion } from "framer-motion";
import { Bell, UserPlus, Phone, MessageSquare } from "lucide-react";
import type { Notification } from "@/lib/types";
import { fetchIncomingFriendRequests } from "@/lib/api";
import { useRespondToFriendRequest } from "@/hooks/useFriends";
import { UserAvatar } from "../UserAvatar";
import { useQuery } from "@tanstack/react-query";
import { IS_DEMO_MODE } from "@/lib/config";
import { springSoft as spring } from "@/lib/animation";
import { ModalShell, ModalHeader } from "./ModalShell";

export type { Notification };

export function NotificationsModal({
  open,
  onClose,
  items,
  onMarkAll,
}: {
  open: boolean;
  onClose: () => void;
  items: Notification[];
  onMarkAll: () => void;
}) {

  const { data: incomingRequests = [] } = useQuery({
    queryKey: ["friend-requests", "incoming"],
    queryFn: fetchIncomingFriendRequests,
    enabled: open && !IS_DEMO_MODE,
  });

  const respondMutation = useRespondToFriendRequest();

  const hasRequests = incomingRequests.length > 0;

  return (
    <ModalShell open={open} onClose={onClose}>
      <ModalHeader title="Thông báo & Lời mời" onClose={onClose} />
      <div className="flex items-center justify-between border-b border-border px-5 py-2.5">
        <div className="text-[12px] text-muted-foreground">
          {items.filter((i) => i.unread).length} tin mới · {incomingRequests.length} lời mời
        </div>
        <button
          onClick={onMarkAll}
          className="rounded-full px-3 py-1 text-[12px] font-medium text-primary hover:bg-primary/10"
        >
          Đánh dấu đã đọc
        </button>
      </div>
      <motion.div
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
        }}
        className="max-h-[420px] overflow-y-auto p-2"
      >
        {hasRequests && (
          <div className="mb-4 border-b border-border/60 pb-3">
            <div className="px-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Lời mời kết bạn đang chờ
            </div>
            <div className="flex flex-col gap-2 p-1">
              {incomingRequests.map((r) => (
                <motion.div
                  key={r.id}
                  variants={{
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0 },
                  }}
                  className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 hover:bg-surface-3 transition-colors"
                >
                  <UserAvatar
                    src={r.fromAvatar}
                    name={r.fromName}
                    className="h-10 w-10 rounded-full"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold truncate">{r.fromName}</div>
                    {r.message && (
                      <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                        "{r.message}"
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button
                      onClick={() => respondMutation.mutate({ requestId: r.id, action: "accept" })}
                      disabled={respondMutation.isPending}
                      className="rounded-full bg-primary px-3 py-1.5 text-[11.5px] font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Đồng ý
                    </button>
                    <button
                      onClick={() => respondMutation.mutate({ requestId: r.id, action: "reject" })}
                      disabled={respondMutation.isPending}
                      className="rounded-full bg-surface-3 border border-border px-3 py-1.5 text-[11.5px] font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Từ chối
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        )}

        {items.length === 0 && !hasRequests ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-12 px-4 text-center"
          >
            <div className="rounded-full bg-surface-2 p-4 text-muted-foreground mb-3">
              <Bell size={24} className="opacity-40" />
            </div>
            <div className="text-[14px] font-semibold text-foreground/80">
              Hiện không có thông báo
            </div>
            <div className="text-[12px] text-muted-foreground mt-1 max-w-[200px]">
              Chúng tôi sẽ thông báo cho bạn khi có hoạt động mới.
            </div>
          </motion.div>
        ) : (
          items.map((n) => (
            <motion.div
              key={n.id}
              variants={{
                hidden: { opacity: 0, y: 12, scale: 0.96 },
                show: { opacity: 1, y: 0, scale: 1, transition: spring },
              }}
              whileHover={{ x: 3 }}
              className={`flex items-start gap-3 rounded-2xl px-3 py-2.5 ${
                n.unread ? "bg-primary/8" : ""
              } hover:bg-surface-2`}
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
                {n.icon === "msg" && <MessageSquare size={16} />}
                {n.icon === "friend" && <UserPlus size={16} />}
                {n.icon === "call" && <Phone size={16} />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[13.5px] font-medium">{n.title}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{n.time}</span>
                </div>
                <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground">{n.body}</div>
              </div>
              {n.unread && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-primary" />}
            </motion.div>
          ))
        )}
      </motion.div>
    </ModalShell>
  );
}
