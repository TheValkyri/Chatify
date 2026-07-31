import { useState, useEffect } from "react";
import { Check } from "lucide-react";
import type { Conversation, Member } from "@/lib/types";
import { UserAvatar } from "../UserAvatar";
import { ModalShell, ModalHeader } from "./ModalShell";

export function TransferOwnershipModal({
  open,
  onClose,
  conv,
  onConfirm,
  currentUserId,
}: {
  open: boolean;
  onClose: () => void;
  conv: Conversation | null;
  onConfirm: (targetMember: Member) => void;
  currentUserId: string;
}) {
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const candidates = conv ? (conv.members || []).filter((m: Member) => m.id !== currentUserId) : [];

  useEffect(() => {
    if (open) {
      setSelectedMember(null);
    }
  }, [open]);

  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHeader title="Trao quyền Trưởng nhóm" onClose={onClose} />
      <div className="p-6 flex flex-col">
        <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 text-center">
          Bạn là Trưởng nhóm của <strong>{conv?.name}</strong>. Hãy trao lại quyền Trưởng nhóm cho
          một thành viên khác trước khi rời đi.
        </p>

        <div className="flex flex-col gap-1.5 max-h-[220px] overflow-y-auto pr-1">
          {candidates.map((m: Member) => {
            const isSelected = selectedMember?.id === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedMember(m)}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 border text-left transition-all ${
                  isSelected
                    ? "border-primary bg-primary/5 shadow-inner"
                    : "border-transparent bg-surface-2 hover:bg-surface-3"
                }`}
              >
                <UserAvatar src={m.avatar} name={m.name} className="h-9 w-9 rounded-full" />
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold truncate">{m.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {m.role === "admin" ? "Phó nhóm" : "Thành viên"}
                  </div>
                </div>
                <div
                  className={`h-4.5 w-4.5 rounded-full border flex items-center justify-center ${
                    isSelected
                      ? "border-primary bg-primary text-primary-foreground animate-pop-punch"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check size={10} />}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            disabled={!selectedMember}
            onClick={() => selectedMember && onConfirm(selectedMember)}
            className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-primary/90"
          >
            Xác nhận & Rời nhóm
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-full border border-border bg-surface-2 py-2.5 text-[13px] font-medium hover:bg-surface"
          >
            Huỷ
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
