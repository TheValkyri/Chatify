import { UserPlus, MessageSquare } from "lucide-react";
import type { Member } from "@/lib/types";
import { UserAvatar } from "../UserAvatar";
import { ModalShell, ModalHeader } from "./ModalShell";

export function MemberProfileModal({
  open,
  onClose,
  member,
  isFriend,
  onAddFriend,
  onStartChat,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  isFriend: boolean;
  onAddFriend: () => void;
  onStartChat: () => void;
  currentUserId: string;
}) {
  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      {member && (
        <>
          <ModalHeader title="Thông tin thành viên" onClose={onClose} />
          <div className="relative">
            <div className="h-28 w-full bg-gradient-to-r from-primary/30 to-secondary/30" />
            <div className="absolute -bottom-8 left-1/2 -translate-x-1/2">
              <UserAvatar
                src={member.avatar}
                name={member.name}
                className="h-20 w-20 rounded-full border-4 border-surface shadow-md"
                textClassName="text-2xl"
              />
            </div>
          </div>
          <div className="flex flex-col items-center px-6 pb-6 pt-10 text-center">
            <div className="text-[16px] font-semibold">{member.name}</div>
            <div className="text-[12px] text-muted-foreground mt-0.5">
              @{member.username || member.name.toLowerCase().replace(/\s+/g, "")}
            </div>

            {member.role && (
              <div className="mt-2.5">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                    member.role === "owner"
                      ? "bg-amber-500/10 text-amber-500"
                      : member.role === "admin"
                        ? "bg-indigo-500/10 text-indigo-500"
                        : "bg-muted-foreground/10 text-muted-foreground"
                  }`}
                >
                  {member.role === "owner"
                    ? "Trưởng nhóm"
                    : member.role === "admin"
                      ? "Phó nhóm"
                      : "Thành viên"}
                </span>
              </div>
            )}

            <div className="mt-6 w-full flex gap-2">
              {member.id !== currentUserId &&
                (isFriend ? (
                  <button
                    type="button"
                    onClick={() => {
                      onStartChat();
                      onClose();
                    }}
                    className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg flex items-center justify-center gap-1.5"
                  >
                    <MessageSquare size={14} /> Nhắn tin
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onAddFriend}
                    className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg flex items-center justify-center gap-1.5"
                  >
                    <UserPlus size={14} /> Kết bạn
                  </button>
                ))}
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-border bg-surface-2 py-2.5 text-[13px] font-medium hover:bg-surface"
              >
                Đóng
              </button>
            </div>
          </div>
        </>
      )}
    </ModalShell>
  );
}
