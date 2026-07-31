import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, MessageSquare, Cake, Mail, Smartphone, User as UserIcon } from "lucide-react";
import type { Profile } from "@/lib/types";
import { uploadFile } from "@/lib/upload";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import { toast } from "sonner";
import { EASE, springSoft as spring } from "@/lib/animation";
import { ModalShell, ModalHeader } from "./ModalShell";

export type { Profile };

function ProfileCoverImage({ src }: { src?: string }) {
  const { url } = useAttachmentUrl(src);
  if (!url) return null;
  return <img src={url} alt="cover" className="h-full w-full object-cover" />;
}

function ProfileAvatarImage({ src }: { src?: string }) {
  const { url } = useAttachmentUrl(src);
  if (!url) return null;
  return <img src={url} alt="avatar" className="h-full w-full object-cover" />;
}

export function ProfileModal({
  open,
  onClose,
  profile,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  profile: Profile;
  onSave: (p: Profile) => void;
}) {
  const [draft, setDraft] = useState(profile);
  const avatarRef = useRef<HTMLInputElement>(null);
  const coverRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) setDraft(profile);
  }, [open, profile]);

  const readFile = async (f: File, key: "avatar" | "cover") => {
    try {
      toast.loading("Đang tải ảnh lên...", { id: "upload-profile-img" });
      const att = await uploadFile(f);
      toast.dismiss("upload-profile-img");
      if (att?.url) {
        setDraft((d) => ({ ...d, [key]: att.url }));
        toast.success("Đã tải ảnh lên!");
      }
    } catch {
      toast.dismiss("upload-profile-img");
      toast.error("Tải ảnh thất bại, dùng tạm xem trước.");
      const url = URL.createObjectURL(f);
      setDraft((d) => ({ ...d, [key]: url }));
    }
  };

  return (
    <ModalShell open={open} onClose={onClose} size="lg">
      <ModalHeader title="Hồ sơ của bạn" onClose={onClose} />
      <div className="relative">
        <motion.div
          key={draft.cover}
          initial={{ opacity: 0.4, scale: 1.02 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="h-40 w-full overflow-hidden bg-surface-2"
        >
          {draft.cover && <ProfileCoverImage src={draft.cover} />}
        </motion.div>
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={() => coverRef.current?.click()}
          className="absolute right-4 top-4 flex items-center gap-1.5 rounded-full bg-background/80 px-3 py-1.5 text-[12px] font-medium backdrop-blur hover:bg-background"
        >
          <Camera size={13} /> Ảnh bìa
        </motion.button>
        <div className="absolute -bottom-10 left-6">
          <motion.div
            key={draft.avatar}
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={spring}
            className="relative h-24 w-24 overflow-hidden rounded-full border-4 border-surface bg-surface-2"
          >
            {draft.avatar && <ProfileAvatarImage src={draft.avatar} />}
          </motion.div>
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => avatarRef.current?.click()}
            className="absolute -right-1 -bottom-1 grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lg"
          >
            <Camera size={14} />
          </motion.button>
        </div>
      </div>
      <div className="px-6 pb-6 pt-14">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{
            hidden: {},
            show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } },
          }}
          className="grid gap-3"
        >
          <Field
            label="Tên hiển thị"
            icon={<UserIcon size={14} />}
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <Field
            label="Tên tài khoản (Username)"
            icon={<span className="text-[12px] font-semibold font-mono">@</span>}
            value={draft.username || ""}
            onChange={(v) => setDraft({ ...draft, username: v.replace("@", "") })}
          />
          <Field
            label="Tiểu sử"
            icon={<MessageSquare size={14} />}
            value={draft.bio}
            onChange={(v) => setDraft({ ...draft, bio: v })}
            multiline
          />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Ngày sinh"
              icon={<Cake size={14} />}
              type="date"
              value={draft.birthday}
              onChange={(v) => setDraft({ ...draft, birthday: v })}
            />
            <Field
              label="Số điện thoại"
              icon={<Smartphone size={14} />}
              value={draft.phone}
              onChange={(v) => setDraft({ ...draft, phone: v })}
            />
          </div>
          <Field
            label="Email"
            icon={<Mail size={14} />}
            type="email"
            value={draft.email}
            onChange={(v) => setDraft({ ...draft, email: v })}
          />
        </motion.div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-full border border-border bg-surface-2 px-4 py-2 text-[13px] font-medium hover:bg-surface"
          >
            Huỷ
          </button>
          <motion.button
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-lg"
          >
            Lưu thay đổi
          </motion.button>
        </div>
      </div>
      <input
        ref={avatarRef}
        type="file"
        accept="image/*,image/gif"
        hidden
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], "avatar")}
      />
      <input
        ref={coverRef}
        type="file"
        accept="image/*,image/gif"
        hidden
        onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], "cover")}
      />
    </ModalShell>
  );
}

function Field({
  label,
  icon,
  value,
  onChange,
  type = "text",
  multiline,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <motion.label
      variants={{
        hidden: { opacity: 0, y: 8 },
        show: { opacity: 1, y: 0, transition: { ...spring } },
      }}
      className="block"
    >
      <div className="mb-1 flex items-center gap-1.5 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span> {label}
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full resize-none rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-[14px] outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-full border border-border bg-surface-2 px-4 py-2.5 text-[14px] outline-none transition-all focus:border-primary/40 focus:ring-4 focus:ring-primary/10"
        />
      )}
    </motion.label>
  );
}
