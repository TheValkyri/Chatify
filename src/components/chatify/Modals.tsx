import { useEffect, useRef, useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  X,
  Camera,
  Check,
  Sun,
  Moon,
  Palette,
  Bell,
  UserPlus,
  Phone,
  Video,
  Mic,
  MicOff,
  VideoOff,
  PhoneOff,
  MessageSquare,
  Cake,
  Mail,
  Smartphone,
  User as UserIcon,
  Copy,
  ChevronDown,
} from "lucide-react";
import { THEMES, type ThemeDef } from "./themes";
import type { Profile, Notification, Friend, Member, Conversation } from "@/lib/types";
import { generateInviteCode, fetchIncomingFriendRequests } from "@/lib/api";
import { uploadFile } from "@/lib/upload";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import { useRespondToFriendRequest } from "@/hooks/useFriends";
import { UserAvatar } from "./UserAvatar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { IS_DEMO_MODE } from "@/lib/config";
import { toast } from "sonner";
import { EASE, springSoft as spring } from "@/lib/animation";

/* ------------------------- Shared modal shell ---------------------------- */
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

/* =============================== PROFILE =============================== */
export type { Profile };

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
          {draft.cover && (
            <img src={draft.cover} alt="cover" className="h-full w-full object-cover" />
          )}
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
            {draft.avatar && (
              <img src={draft.avatar} alt="avatar" className="h-full w-full object-cover" />
            )}
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

/* =============================== SETTINGS =============================== */
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

/* ============================== LIQUID FX =============================== */
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

/* =========================== NOTIFICATIONS ============================== */
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
  const queryClient = useQueryClient();

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
        {/* Lời mời kết bạn trước */}
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

/* =============================== FRIENDS ================================ */
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

/* ================================ CALL ================================== */
export function CallModal({
  open,
  onClose,
  peer,
  kind,
}: {
  open: boolean;
  onClose: () => void;
  peer: { name: string; avatar: string } | null;
  kind: "voice" | "video";
}) {
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [connected, setConnected] = useState(false);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!open) {
      setConnected(false);
      setSeconds(0);
      setMuted(false);
      setCamOff(false);
      return;
    }
    const t = setTimeout(() => setConnected(true), 1600);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [connected]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <AnimatePresence>
      {open && peer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[55] grid place-items-center"
        >
          <motion.div
            initial={{ scale: 1.08 }}
            animate={{ scale: 1 }}
            exit={{ scale: 1.05 }}
            transition={{ duration: 0.4, ease: EASE }}
            className="absolute inset-0"
          >
            <img
              src={peer.avatar}
              alt=""
              className="h-full w-full scale-150 object-cover opacity-30 blur-3xl"
            />
            <div className="absolute inset-0 bg-background/70 backdrop-blur-3xl" />
          </motion.div>
          <motion.div
            initial={{ y: 20, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.96 }}
            transition={spring}
            className="relative flex flex-col items-center gap-6 px-8"
          >
            <div className="text-center">
              <div className="text-[12px] uppercase tracking-[0.24em] text-muted-foreground">
                {kind === "video" ? "Cuộc gọi video" : "Cuộc gọi thoại"}
              </div>
              <div className="mt-2 font-serif-display text-[40px] leading-none">{peer.name}</div>
              <motion.div
                key={connected ? "conn" : "ring"}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-2 text-[13px] text-muted-foreground"
              >
                {connected ? `${mm}:${ss}` : "Đang kết nối…"}
              </motion.div>
            </div>

            <div className="relative">
              {!connected && (
                <>
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary/40"
                    animate={{ scale: [1, 1.35], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                  <motion.span
                    className="absolute inset-0 rounded-full border-2 border-primary/30"
                    animate={{ scale: [1, 1.55], opacity: [0.5, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.6 }}
                  />
                </>
              )}
              <motion.img
                src={peer.avatar}
                alt={peer.name}
                animate={connected ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="relative h-40 w-40 rounded-full object-cover shadow-2xl"
              />
              {kind === "video" && !camOff && connected && (
                <motion.div
                  initial={{ opacity: 0, y: 12, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={spring}
                  className="absolute -bottom-2 -right-6 h-20 w-16 overflow-hidden rounded-2xl border-2 border-background bg-surface-2 shadow-xl"
                >
                  <div className="grid h-full w-full place-items-center text-[10px] text-muted-foreground">
                    Bạn
                  </div>
                </motion.div>
              )}
            </div>

            <div className="mt-4 flex items-center gap-3">
              <CallBtn
                active={!muted}
                onClick={() => setMuted((m) => !m)}
                icon={muted ? <MicOff size={18} /> : <Mic size={18} />}
              />
              {kind === "video" && (
                <CallBtn
                  active={!camOff}
                  onClick={() => setCamOff((c) => !c)}
                  icon={camOff ? <VideoOff size={18} /> : <Video size={18} />}
                />
              )}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.9 }}
                onClick={onClose}
                className="grid h-14 w-14 place-items-center rounded-full bg-destructive text-destructive-foreground shadow-lg shadow-destructive/40"
              >
                <PhoneOff size={20} />
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function CallBtn({
  active,
  onClick,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      className={`grid h-12 w-12 place-items-center rounded-full transition-colors ${
        active ? "bg-surface text-foreground" : "bg-surface-2 text-muted-foreground"
      }`}
    >
      {icon}
    </motion.button>
  );
}

/* ============================ CUSTOM SELECT =========================== */
interface Option {
  value: string;
  label: string;
}

function CustomSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Option[];
  onChange: (val: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const activeOption = options.find((o) => o.value === value) || options[0];

  return (
    <div ref={containerRef} className="relative flex flex-col gap-2">
      <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <motion.button
        type="button"
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between rounded-2xl border border-border bg-surface-2 px-4 py-2.5 text-[13.5px] font-medium outline-none focus:border-primary/40 focus:ring-4 focus:ring-primary/10 text-left transition-all"
      >
        <span className="text-foreground">{activeOption?.label}</span>
        <motion.span
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="text-muted-foreground"
        >
          <ChevronDown size={16} />
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="absolute top-[calc(100%+4px)] left-0 z-50 w-full overflow-hidden rounded-2xl border border-border bg-surface shadow-xl backdrop-blur-lg"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value);
                    setIsOpen(false);
                  }}
                  className={`flex w-full items-center justify-between px-4 py-2.5 text-[13px] text-left transition-colors ${
                    isSelected
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-foreground/80 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span>{opt.label}</span>
                  {isSelected && <Check size={14} className="text-primary" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================ INVITE MODAL =========================== */
const expiryOptions = [
  { value: "30m", label: "30 phút" },
  { value: "1h", label: "1 giờ" },
  { value: "24h", label: "24 giờ" },
  { value: "infinite", label: "Không giới hạn" },
];

const usageOptions = [
  { value: "1", label: "1 lần" },
  { value: "5", label: "5 lần" },
  { value: "10", label: "10 lần" },
  { value: "infinite", label: "Không giới hạn" },
];

export function InviteModal({
  open,
  onClose,
  convId,
  groupName,
}: {
  open: boolean;
  onClose: () => void;
  convId: string;
  groupName: string;
}) {
  const [code, setCode] = useState("");
  const [expiry, setExpiry] = useState("30m"); // 30m, 1h, 24h, infinite
  const [usages, setUsages] = useState("infinite"); // 1, 5, 10, infinite
  const [copied, setCopied] = useState(false);

  const handleGenerate = useCallback(async () => {
    try {
      const num = await generateInviteCode(convId, groupName, expiry, usages);
      setCode(num);
      setCopied(false);
    } catch (e) {
      // ignore
    }
  }, [convId, groupName, expiry, usages]);

  useEffect(() => {
    if (open) {
      handleGenerate();
    }
  }, [open, handleGenerate]);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ModalShell open={open} onClose={onClose} size="sm">
      <ModalHeader title="Mã mời vào nhóm" onClose={onClose} />
      <div className="flex flex-col items-center p-6 text-center">
        <div className="mb-2 text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
          Mã mời của {groupName}
        </div>

        {/* Punchy animated code box */}
        <motion.div
          key={code}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 350, damping: 20 }}
          className="my-4 flex items-center justify-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-6 py-4 font-mono text-2xl font-bold tracking-widest text-primary shadow-inner"
        >
          <span>
            {code.slice(0, 5)} {code.slice(5)}
          </span>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleCopy}
            className={`grid h-9 w-9 place-items-center rounded-xl transition-colors ${
              copied
                ? "bg-emerald-500 text-white"
                : "bg-primary/10 text-primary hover:bg-primary/20"
            }`}
            title="Sao chép"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </motion.button>
        </motion.div>

        {copied && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[12px] font-medium text-emerald-400"
          >
            Đã sao chép mã mời!
          </motion.div>
        )}

        <div className="mt-6 w-full text-left flex flex-col gap-4 border-t border-border/40 pt-5 z-20">
          <CustomSelect
            label="Thời gian hiệu lực"
            value={expiry}
            options={expiryOptions}
            onChange={setExpiry}
          />

          <CustomSelect
            label="Giới hạn số lần dùng"
            value={usages}
            options={usageOptions}
            onChange={setUsages}
          />
        </div>

        <div className="mt-6 w-full flex gap-2">
          <button
            onClick={handleGenerate}
            className="flex-1 rounded-full border border-border bg-surface-2 py-2.5 text-[13px] font-medium hover:bg-surface"
          >
            Tạo mã khác
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-primary py-2.5 text-[13px] font-semibold text-primary-foreground shadow-lg"
          >
            Xong
          </button>
        </div>
      </div>
    </ModalShell>
  );
}

/* ========================== MEMBER PROFILE =========================== */
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

/* ============================ CONFIRM LEAVE =========================== */
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

/* ======================== TRANSFER OWNERSHIP ========================== */
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
