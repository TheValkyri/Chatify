import { ModalShell, ModalHeader } from "./ModalShell";

export function ConfirmLeaveModal({
  open,
  onClose,
  groupName,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  groupName: string;
  onConfirm: () => void;
}) {
  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHeader title="Xác nhận rời nhóm" onClose={onClose} />
      <div className="p-6 text-center">
        <p className="text-[14px] text-foreground/80 leading-relaxed">
          Bạn có chắc chắn muốn rời khỏi nhóm <strong>{groupName}</strong>? Hành động này không thể
          hoàn tác.
        </p>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-destructive py-2.5 text-[13px] font-semibold text-destructive-foreground shadow-lg hover:bg-destructive/90"
          >
            Rời nhóm
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
