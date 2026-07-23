import { useEffect, useMemo, useRef, useState } from "react";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
import { AnimatePresence, motion } from "framer-motion";
import { useMutation } from "@tanstack/react-query";
import {
  Search,
  Phone,
  Video,
  Info,
  Plus,
  Image as ImageIcon,
  FileText,
  Folder,
  Paperclip,
  Send,
  X,
  Play,
  Download,
  ChevronDown,
  MessageSquare,
  Users,
  Settings,
  Bell,
  Check,
  CheckCheck,
  LogOut,
  PanelLeftClose,
  PanelLeft,
  UserPlus,
  MoreHorizontal,
} from "lucide-react";
import { avatar as createAvatar } from "@/lib/chatify-mock";
import type {
  Attachment,
  Message,
  Conversation,
  Member,
  Notification,
  Friend,
  Profile,
  AuthUser,
  Draft,
} from "@/lib/types";
import {
  downloadFile,
  downloadFolder,
  downloadAttachment,
  zipFolderToBlob,
  type OriginalFile,
} from "@/lib/file-transfer";
import { toast } from "sonner";
import { STORAGE_KEYS } from "@/lib/config";
import {
  useConversations,
  useCreateConversation,
  useDeleteConversation,
  useUpdateConversation,
  useUpdateMemberRole,
  useRemoveMember,
  useTransferOwnership,
  useJoinConversation,
} from "@/hooks/useConversations";
import { useMessages, useSendMessage, useUpdateMessage } from "@/hooks/useMessages";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { useRealtimeGlobal } from "@/hooks/useRealtimeGlobal";
import { usePresence } from "@/hooks/usePresence";
import { useFriends } from "@/hooks/useFriends";
import {
  searchUsers,
  sendFriendRequest,
  markMessagesAsRead,
  updateProfile,
  incrementInviteUsage,
  fetchProfilesByIds,
} from "@/lib/api";
import { uploadFile, buildAttachment } from "@/lib/upload";
import { THEMES, applyTheme, type ThemeDef } from "./themes";
import {
  ProfileModal,
  SettingsModal,
  NotificationsModal,
  FriendsModal,
  CallModal,
  LiquidTransition,
  InviteModal,
  MemberProfileModal,
  ConfirmLeaveModal,
  TransferOwnershipModal,
} from "./Modals";

/* ------------------------------ Animations ------------------------------- */
const EASE = [0.22, 1, 0.36, 1] as const;
const springSoft = { type: "spring" as const, stiffness: 260, damping: 26 };
const springSidebar = { type: "spring" as const, stiffness: 220, damping: 28 };

/* --------------------------------- Utils --------------------------------- */
function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

/* ------------------------------ Draft type ------------------------------- */
// Draft type is imported from @/lib/types — no longer defined here.

type Modal = null | "profile" | "settings" | "notifications" | "friends";
type LiquidPulse = { key: number; color: string; x: number; y: number } | null;

type WebkitFileEntry = {
  isFile: true;
  isDirectory: false;
  fullPath: string;
  file: (success: (file: File) => void, failure?: (error: DOMException) => void) => void;
};

type WebkitDirectoryEntry = {
  isFile: false;
  isDirectory: true;
  createReader: () => {
    readEntries: (
      success: (entries: WebkitEntry[]) => void,
      failure?: (error: DOMException) => void,
    ) => void;
  };
};

type WebkitEntry = WebkitFileEntry | WebkitDirectoryEntry;

async function readEntry(entry: WebkitEntry, files: OriginalFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) => entry.file(resolve, reject));
    files.push({ file, path: entry.fullPath.replace(/^\/+/, "") || file.name });
    return;
  }

  const reader = entry.createReader();
  while (true) {
    const entries = await new Promise<WebkitEntry[]>((resolve, reject) =>
      reader.readEntries(resolve, reject),
    );
    if (!entries.length) return;
    await Promise.all(entries.map((child) => readEntry(child, files)));
  }
}

async function getDroppedFiles(items: DataTransferItemList): Promise<OriginalFile[]> {
  const files: OriginalFile[] = [];
  await Promise.all(
    Array.from(items).map(async (item) => {
      const entry = (
        item as DataTransferItem & { webkitGetAsEntry?: () => WebkitEntry | null }
      ).webkitGetAsEntry?.();
      if (entry) {
        // @ts-expect-error — webkitGetAsEntry returns FileSystemEntry which lacks full typing
        await readEntry(entry, files);
        return;
      }
      const file = item.getAsFile();
      if (file) files.push({ file, path: file.name });
    }),
  );
  return files;
}

/* --------------------------- Notifications (empty by default) ------------ */
const seedNotifications: Notification[] = [];

// Seed friends will be dynamically generated in the component from the conversation list

/* ============================== ROOT SHELL ============================== */
export function ChatifyApp({ session, onSignOut }: { session: AuthUser; onSignOut: () => void }) {
  const { data: convsData = [] } = useConversations();
  const convs = convsData || [];

  const [activeId, setActiveId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEYS.ACTIVE_ID);
      if (stored) return stored;
    }
    return "";
  });

  const { data: activeMessages = [] } = useMessages(activeId || null);
  const messages = activeMessages || [];
  useRealtimeMessages(activeId || null);
  useRealtimeGlobal(session.id);
  const onlineUsers = usePresence(session.id);
  const { data: dbFriends } = useFriends();

  const sendMessageMutation = useSendMessage(activeId || null);
  const updateMessage = useUpdateMessage(activeId || "");
  const createConvMutation = useCreateConversation();
  const deleteConvMutation = useDeleteConversation();
  const updateConvMutation = useUpdateConversation();
  const updateMemberRoleMutation = useUpdateMemberRole();
  const removeMemberMutation = useRemoveMember();
  const transferOwnershipMutation = useTransferOwnership();
  const joinConvMutation = useJoinConversation();

  const [showCreateChat, setShowCreateChat] = useState(false);
  const [createChatInitialTab, setCreateChatInitialTab] = useState<"create" | "join">("create");
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [mode, setMode] = useState<"dark" | "light">(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEYS.MODE);
      if (stored === "dark" || stored === "light") return stored;
    }
    return "dark";
  });
  const [themeKey, setThemeKey] = useState<string>(() => {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem(STORAGE_KEYS.THEME);
      if (stored) return stored;
    }
    return "peach";
  });
  const [modal, setModal] = useState<Modal>(null);
  const [pulse, setPulse] = useState<LiquidPulse>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [addedFriendNames, setAddedFriendNames] = useState<string[]>([]);
  const [transferOwnershipConv, setTransferOwnershipConv] = useState<Conversation | null>(null);
  const [confirmLeaveConv, setConfirmLeaveConv] = useState<Conversation | null>(null);
  const [callState, setCallState] = useState<{
    peer: { name: string; avatar: string };
    kind: "voice" | "video";
  } | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  // Sync activeId to local storage
  useEffect(() => {
    if (activeId) window.localStorage.setItem(STORAGE_KEYS.ACTIVE_ID, activeId);
    else window.localStorage.removeItem(STORAGE_KEYS.ACTIVE_ID);
  }, [activeId]);

  useEffect(() => {
    if (activeId && session.id) {
      markMessagesAsRead(activeId, session.id).catch(console.error);
    }
  }, [activeId, messages.length, session.id]);

  const mappedConvs = useMemo(() => {
    return convs.map((c) => {
      if (c.isGroup) return c;
      const otherMember = c.members.find((m) => m.id !== session.id);
      const isOnline = otherMember ? onlineUsers.has(otherMember.id) : false;
      return {
        ...c,
        presence: (isOnline ? "online" : "offline") as import("@/lib/types").Presence,
      };
    });
  }, [convs, onlineUsers, session.id]);

  const seedFriends = useMemo<Friend[]>(() => {
    // Use real friends from DB if available, otherwise derive from conversations
    if (dbFriends && dbFriends.length > 0) {
      return dbFriends.map((f) => ({
        ...f,
        status: onlineUsers.has(f.id) ? "Đang trực tuyến" : "Ngoại tuyến",
        online: onlineUsers.has(f.id),
      }));
    }
    return mappedConvs.map((c) => {
      const isOnline = c.presence === "online";
      return {
        id: c.id,
        name: c.name,
        avatar: c.avatar,
        status: isOnline ? "Đang trực tuyến" : "Ngoại tuyến",
        online: isOnline,
      };
    });
  }, [mappedConvs, dbFriends, onlineUsers]);

  const [profile, setProfile] = useState<Profile>({
    name: session.name,
    username: session.username || session.email.split("@")[0],
    avatar: session.avatar,
    cover: "",
    bio: "Yêu ảnh gốc, ghét bị nén.",
    birthday: "1998-06-12",
    phone: "+84 912 345 678",
    email: session.email,
  });

  const updateProfileMutation = useMutation({
    mutationFn: (newProfile: Profile) => updateProfile(session.id, newProfile),
    onSuccess: (_, newProfile) => {
      setProfile(newProfile);
      toast.success("Đã lưu thông tin cá nhân!");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Không thể cập nhật hồ sơ.");
    },
  });

  // Apply theme whenever mode/theme changes
  useEffect(() => {
    const t = THEMES.find((x) => x.key === themeKey) ?? THEMES[0];
    applyTheme(t, mode);
  }, [themeKey, mode]);

  const triggerPulse = (color: string, from: { x: number; y: number }) => {
    setPulse({ key: Date.now(), color, x: from.x, y: from.y });
    window.setTimeout(() => setPulse(null), 1100);
  };

  const handleThemeChange = (t: ThemeDef, from: { x: number; y: number }) => {
    const c = mode === "dark" ? t.dark.primary : t.light.primary;
    triggerPulse(c, from);
    setThemeKey(t.key);
    window.localStorage.setItem(STORAGE_KEYS.THEME, t.key);
  };

  const handleModeChange = (m: "dark" | "light", from: { x: number; y: number }) => {
    const t = THEMES.find((x) => x.key === themeKey) ?? THEMES[0];
    const c = m === "dark" ? t.dark.background : t.light.background;
    triggerPulse(c, from);
    setMode(m);
    window.localStorage.setItem(STORAGE_KEYS.MODE, m);
  };

  const activeConv = mappedConvs.find((c) => c.id === activeId);

  const sendMessage = (msg: Message) => {
    sendMessageMutation.mutate(msg);
  };

  const handleCreateConversation = async (
    name: string,
    isGroup: boolean,
    presence: "online" | "away" | "offline",
    desc: string,
    memberIds?: string[],
  ) => {
    const cleanName = name.trim();
    const initials =
      cleanName
        .split(/\s+/)
        .map((w) => w[0] || "")
        .join("")
        .toUpperCase()
        .slice(0, 2) || "GP";

    const gradientPairs = [
      ["#F0356B", "#7c1d3d"], // Rose
      ["#3d5afe", "#1a237e"], // Indigo
      ["#26c6da", "#00695c"], // Teal
      ["#ffb74d", "#e65100"], // Orange
      ["#ba68c8", "#4a148c"], // Purple
      ["#66bb6a", "#1b5e20"], // Green
    ];
    const len = Array.isArray(convs) ? convs.length : 0;
    const pair = gradientPairs[len % gradientPairs.length] || gradientPairs[0];
    const newAvatar = createAvatar(initials, pair[0], pair[1]);

    const newId = isGroup ? `g_${Date.now()}` : `c_${Date.now()}`;
    const selectedMembers: Member[] = [
      {
        id: session.id,
        name: session.name,
        avatar: session.avatar,
        role: isGroup ? ("owner" as const) : ("member" as const),
      },
    ];

    if (isGroup && memberIds) {
      const missingIds: string[] = [];
      memberIds.forEach((id) => {
        const found = mappedConvs.find((c) => !c.isGroup && c.members.some((m) => m.id === id));
        const memberProfile = found?.members.find((m) => m.id === id);
        if (memberProfile) {
          selectedMembers.push({
            id: memberProfile.id,
            name: memberProfile.name,
            avatar: memberProfile.avatar,
            role: "member" as const,
          });
        } else {
          missingIds.push(id);
        }
      });

      if (missingIds.length > 0) {
        try {
          const fallbackMembers = await fetchProfilesByIds(missingIds);
          selectedMembers.push(...fallbackMembers);
        } catch (err) {
          console.error("Lỗi khi tra cứu profile thành viên nhóm:", err);
        }
      }
    } else if (!isGroup) {
      const otherId = memberIds?.[0];
      if (otherId) {
        const found = mappedConvs.find(
          (c) => !c.isGroup && c.members.some((m) => m.id === otherId),
        );
        let otherProfile = found?.members.find((m) => m.id === otherId);

        if (!otherProfile) {
          try {
            const fallback = await fetchProfilesByIds([otherId]);
            if (fallback[0]) {
              otherProfile = fallback[0];
            }
          } catch (err) {
            console.error("Lỗi khi tra cứu profile đối phương:", err);
          }
        }

        if (otherProfile) {
          selectedMembers.push({
            id: otherProfile.id,
            name: otherProfile.name,
            avatar: otherProfile.avatar,
            role: "member" as const,
          });
        } else {
          toast.error("Không thể bắt đầu trò chuyện — không tìm thấy người dùng này.");
          return;
        }
      } else {
        toast.error("Không thể bắt đầu trò chuyện — không tìm thấy người dùng này.");
        return;
      }
    }

    const newConv: Conversation = {
      id: newId,
      name,
      avatar: newAvatar,
      preview: isGroup ? "Nhóm mới được tạo" : "Cuộc trò chuyện mới được tạo",
      time: "vừa xong",
      unread: 0,
      presence: isGroup ? "online" : presence,
      isGroup: isGroup,
      description: desc,
      members: selectedMembers,
    };

    createConvMutation.mutate(newConv, {
      onError: (err) => {
        toast.error(err instanceof Error ? err.message : "Không thể tạo cuộc trò chuyện.");
      },
    });
    setActiveId(newId);
  };

  const handleJoinGroup = (groupId: string, groupName: string) => {
    if (Array.isArray(convs) && convs.some((c) => c.id === groupId)) {
      setActiveId(groupId);
      return;
    }

    joinConvMutation.mutate(
      {
        convId: groupId,
        member: {
          id: session.id,
          name: session.name,
          avatar: session.avatar,
          role: "member" as const,
        },
      },
      {
        onSuccess: () => {
          setActiveId(groupId);
          toast.success(`Đã tham gia nhóm ${groupName}!`);
        },
        onError: (err) => {
          toast.error(err instanceof Error ? err.message : "Không thể tham gia nhóm.");
        },
      },
    );
  };

  const handleLeaveGroupClick = (convToLeave: Conversation) => {
    const myMember = (convToLeave.members || []).find((m) => m.id === session.id);
    const otherMembers = (convToLeave.members || []).filter((m) => m.id !== session.id);

    if (myMember?.role === "owner" && otherMembers.length > 0) {
      setTransferOwnershipConv(convToLeave);
    } else {
      setConfirmLeaveConv(convToLeave);
    }
  };

  const executeLeaveGroup = (convToLeave: Conversation) => {
    if (convToLeave.isGroup) {
      removeMemberMutation.mutate({
        convId: convToLeave.id,
        memberId: session.id,
        currentUserId: session.id,
      });
    } else {
      deleteConvMutation.mutate(convToLeave.id);
    }
    if (activeId === convToLeave.id) {
      setActiveId("");
    }
    setConfirmLeaveConv(null);
  };

  const executeTransferAndLeave = (convToLeave: Conversation, targetMember: Member) => {
    transferOwnershipMutation.mutate(
      {
        convId: convToLeave.id,
        newOwnerId: targetMember.id,
        currentOwnerId: session.id,
      },
      {
        onSuccess: () => {
          removeMemberMutation.mutate({
            convId: convToLeave.id,
            memberId: session.id,
            currentUserId: session.id,
          });
          if (activeId === convToLeave.id) {
            setActiveId("");
          }
          setTransferOwnershipConv(null);
        },
      },
    );
  };

  const startCall = (peer: { name: string; avatar: string }, kind: "voice" | "video") => {
    setCallState({ peer, kind });
  };

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Ambient warm glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          aria-hidden
          className="absolute -left-40 top-1/4 h-[520px] w-[520px] rounded-full opacity-[0.14] blur-[130px]"
          style={{ backgroundColor: "var(--ambient-1, #f5a57d)" }}
          animate={{ x: [0, 40, 0], y: [0, -24, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          aria-hidden
          className="absolute -right-40 bottom-0 h-[460px] w-[460px] rounded-full opacity-[0.10] blur-[140px]"
          style={{ backgroundColor: "var(--ambient-2, #c4623a)" }}
          animate={{ x: [0, -30, 0], y: [0, 30, 0] }}
          transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative z-10 flex h-full w-full">
        <Rail
          profile={profile}
          onOpen={setModal}
          onToggleSidebar={() => setShowSidebar((s) => !s)}
          sidebarOpen={showSidebar}
          unreadNotifications={notifications.filter((notification) => notification.unread).length}
          onSignOut={onSignOut}
        />
        <AnimatePresence initial={false}>
          {showSidebar && (
            <Sidebar
              key="sidebar"
              convs={mappedConvs}
              activeId={activeId}
              onSelect={setActiveId}
              onCreateChat={() => {
                setCreateChatInitialTab("create");
                setShowCreateChat(true);
              }}
            />
          )}
        </AnimatePresence>
        <main className="flex min-w-0 flex-1 flex-col">
          {activeConv ? (
            <>
              <ChatHeader
                conv={activeConv}
                showDetail={showDetail}
                onToggleDetail={() => setShowDetail((s) => !s)}
                onCall={(kind) =>
                  startCall({ name: activeConv.name, avatar: activeConv.avatar }, kind)
                }
                onInvite={() => setInviteModalOpen(true)}
              />
              <ChatArea
                conversationId={activeId}
                messages={messages}
                onSend={sendMessage}
                onPreview={setPreviewAttachment}
                updateMessage={updateMessage}
                currentUserId={session.id}
              />
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-background/30 backdrop-blur-sm">
              <div className="font-serif-display text-4xl mb-4 text-foreground/80">
                Chào mừng đến với Chatify.
              </div>
              <p className="max-w-md text-sm text-muted-foreground mb-6 leading-relaxed">
                Chọn một hội thoại hoặc tạo cuộc trò chuyện mới từ thanh bên trái để bắt đầu chia sẻ
                file gốc chất lượng cao không bị nén.
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowCreateChat(true)}
                className="flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg"
              >
                <Plus size={16} /> Tạo cuộc hội thoại mới
              </motion.button>
            </div>
          )}
        </main>
        <AnimatePresence initial={false}>
          {showDetail && activeConv && (
            <DetailPanel
              key="detail"
              conv={activeConv}
              messages={messages}
              onPreview={setPreviewAttachment}
              onInvite={() => setInviteModalOpen(true)}
              onViewProfile={setProfileMember}
              onLeaveGroup={() => handleLeaveGroupClick(activeConv)}
              session={session}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Modals */}
      <ProfileModal
        open={modal === "profile"}
        onClose={() => setModal(null)}
        profile={profile}
        onSave={(p) => updateProfileMutation.mutate(p)}
      />
      <SettingsModal
        open={modal === "settings"}
        onClose={() => setModal(null)}
        themeKey={themeKey}
        mode={mode}
        onThemeChange={handleThemeChange}
        onModeChange={handleModeChange}
      />
      <NotificationsModal
        open={modal === "notifications"}
        onClose={() => setModal(null)}
        items={notifications}
        onMarkAll={() => setNotifications((ns) => ns.map((n) => ({ ...n, unread: false })))}
      />
      <FriendsModal
        open={modal === "friends"}
        onClose={() => setModal(null)}
        friends={seedFriends}
        onCall={(f, kind) => {
          setModal(null);
          startCall({ name: f.name, avatar: f.avatar }, kind);
        }}
        onAddFriend={() => {
          setModal(null);
          setCreateChatInitialTab("join");
          setShowCreateChat(true);
        }}
      />
      <CallModal
        open={!!callState}
        onClose={() => setCallState(null)}
        peer={callState?.peer ?? null}
        kind={callState?.kind ?? "voice"}
      />
      <CreateChatModal
        open={showCreateChat}
        onClose={() => setShowCreateChat(false)}
        initialTab={createChatInitialTab}
        onCreate={handleCreateConversation}
        onJoin={handleJoinGroup}
        onFriendRequestSuccess={() => {
          setModal("friends");
        }}
        friends={seedFriends}
      />
      <InviteModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        convId={activeId}
        groupName={activeConv?.name || "Nhóm"}
      />
      <MemberProfileModal
        open={!!profileMember}
        onClose={() => setProfileMember(null)}
        member={profileMember}
        isFriend={
          profileMember
            ? seedFriends.some((f) => f.name === profileMember.name) ||
              addedFriendNames.includes(profileMember.name)
            : false
        }
        onAddFriend={() => {
          if (profileMember) {
            setAddedFriendNames((prev) => [...prev, profileMember.name]);
          }
        }}
        onStartChat={() => {
          if (profileMember) {
            const existing = convs.find((c) => !c.isGroup && c.name === profileMember.name);
            if (existing) {
              setActiveId(existing.id);
            } else {
              handleCreateConversation(profileMember.name, false, "online", "");
            }
          }
        }}
      />
      <ConfirmLeaveModal
        open={!!confirmLeaveConv}
        onClose={() => setConfirmLeaveConv(null)}
        groupName={confirmLeaveConv?.name || ""}
        onConfirm={() => {
          if (confirmLeaveConv) executeLeaveGroup(confirmLeaveConv);
        }}
      />
      <TransferOwnershipModal
        open={!!transferOwnershipConv}
        onClose={() => setTransferOwnershipConv(null)}
        conv={transferOwnershipConv}
        onConfirm={(targetMember) => {
          if (transferOwnershipConv) executeTransferAndLeave(transferOwnershipConv, targetMember);
        }}
      />

      <LiquidTransition pulse={pulse} />

      <PreviewModal
        open={!!previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        att={previewAttachment}
      />
    </div>
  );
}

/* ================================== RAIL ================================= */
function Rail({
  profile,
  onOpen,
  onToggleSidebar,
  sidebarOpen,
  unreadNotifications,
  onSignOut,
}: {
  profile: Profile;
  onOpen: (m: Modal) => void;
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  unreadNotifications: number;
  onSignOut: () => void;
}) {
  const items = [
    { icon: MessageSquare, label: "Tin nhắn", active: true, onClick: () => {} },
    { icon: Users, label: "Bạn bè", active: false, onClick: () => onOpen("friends") },
    { icon: Settings, label: "Cài đặt", active: false, onClick: () => onOpen("settings") },
  ] as const;

  return (
    <aside className="relative flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-border bg-background/60 py-5 backdrop-blur-xl">
      <motion.div
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.95 }}
        className="font-serif-display mb-4 grid h-11 w-11 place-items-center rounded-2xl text-[28px] leading-none"
        style={{ color: "var(--foreground)" }}
      >
        C<span style={{ color: "var(--primary)" }}>.</span>
      </motion.div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        onClick={onToggleSidebar}
        className="mb-2 grid h-9 w-9 place-items-center rounded-2xl text-muted-foreground hover:bg-surface hover:text-foreground"
        aria-label={sidebarOpen ? "Đóng danh sách" : "Mở danh sách"}
      >
        {sidebarOpen ? <PanelLeftClose size={17} /> : <PanelLeft size={17} />}
      </motion.button>

      {items.map((it) => (
        <motion.button
          key={it.label}
          onClick={it.onClick}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          className={`group relative grid h-11 w-11 place-items-center rounded-2xl transition-colors ${
            it.active
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
          aria-label={it.label}
        >
          {it.active && (
            <motion.span
              layoutId="rail-active"
              className="absolute left-0 h-6 w-[3px] rounded-r-full bg-primary"
            />
          )}
          <it.icon size={19} strokeWidth={2} />
        </motion.button>
      ))}

      <div className="flex-1" />

      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        onClick={() => onOpen("profile")}
        className="relative mt-1 overflow-hidden rounded-full ring-2 ring-primary/40 hover:ring-primary transition-shadow"
        aria-label="Hồ sơ"
      >
        <img
          src={profile.avatar}
          alt={profile.name}
          className="h-10 w-10 rounded-full object-cover"
        />
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.92 }}
        onClick={onSignOut}
        className="mt-2 grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
        aria-label="Đăng xuất"
      >
        <LogOut size={17} />
      </motion.button>
    </aside>
  );
}

/* ================================ SIDEBAR ================================ */
function Sidebar({
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
                (idStr.startsWith("c_") || idStr.startsWith("g_")) &&
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
                    <img src={c.avatar} alt={c.name} className="h-12 w-12 rounded-full" />
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

/* =============================== CHAT HEADER ============================= */
function ChatHeader({
  conv,
  showDetail,
  onToggleDetail,
  onCall,
  onInvite,
}: {
  conv: Conversation;
  showDetail: boolean;
  onToggleDetail: () => void;
  onCall: (kind: "voice" | "video") => void;
  onInvite: () => void;
}) {
  const isGroup =
    conv.isGroup ||
    String(conv.id).startsWith("g_") ||
    conv.name?.includes("Nhóm") ||
    conv.name?.includes("Đội");
  return (
    <header className="flex h-[68px] shrink-0 items-center gap-3 border-b border-border px-6">
      <img src={conv.avatar} alt={conv.name} className="h-10 w-10 rounded-full" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold">{conv.name}</div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              conv.presence === "online"
                ? "bg-emerald-400"
                : conv.presence === "away"
                  ? "bg-amber-400"
                  : "bg-muted-foreground/50"
            }`}
          />
          {conv.presence === "online"
            ? "Đang hoạt động"
            : conv.presence === "away"
              ? "Vắng mặt"
              : "Ngoại tuyến"}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isGroup && (
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.92 }}
            onClick={onInvite}
            className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground mr-1"
            aria-label="Mời thành viên"
            title="Mời vào nhóm bằng mã code"
          >
            <UserPlus size={18} />
          </motion.button>
        )}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onCall("voice")}
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Gọi thoại"
        >
          <Phone size={18} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={() => onCall("video")}
          className="grid h-10 w-10 place-items-center rounded-full text-muted-foreground hover:bg-surface hover:text-foreground"
          aria-label="Gọi video"
        >
          <Video size={18} />
        </motion.button>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          onClick={onToggleDetail}
          className={`grid h-10 w-10 place-items-center rounded-full transition-colors ${
            showDetail
              ? "bg-surface text-foreground"
              : "text-muted-foreground hover:bg-surface hover:text-foreground"
          }`}
          aria-label="Chi tiết"
        >
          <Info size={18} />
        </motion.button>
      </div>
    </header>
  );
}

/* ================================ CHAT AREA ============================== */
function ChatArea({
  conversationId,
  messages,
  onSend,
  onPreview,
  updateMessage,
  currentUserId,
}: {
  conversationId: string;
  messages: Message[];
  onSend: (m: Message) => void;
  onPreview: (att: Attachment) => void;
  updateMessage: (id: string, patch: Partial<Message>) => void;
  currentUserId: string;
}) {
  const [text, setText] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragCounter = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const draftsRef = useRef<Draft[]>([]);
  const retainedPreviewUrls = useRef(new Set<string>());

  const revokePreview = (draft: Draft) => {
    if (draft.url) URL.revokeObjectURL(draft.url);
  };

  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  useEffect(() => {
    const currentRetained = retainedPreviewUrls.current;
    return () => {
      draftsRef.current.forEach(revokePreview);
      currentRetained.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    draftsRef.current.forEach(revokePreview);
    setText("");
    setDrafts([]);
  }, [conversationId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, drafts.length]);

  const addEntries = (entries: OriginalFile[], asFolder = false) => {
    if (!entries.length) return;
    if (asFolder) {
      const folderName = entries[0].path.split("/")[0] || "Thư mục đã chọn";
      const total = entries.reduce((sum, source) => sum + source.file.size, 0);
      setDrafts((d) => [
        ...d,
        {
          id: crypto.randomUUID(),
          kind: "folder",
          name: folderName,
          size: fmtSize(total),
          meta: `${entries.length} tệp`,
          folderFiles: entries.slice(0, 6).map((source) => ({
            name: source.path,
            size: fmtSize(source.file.size),
          })),
          sourceFiles: entries,
        },
      ]);
      return;
    }
    const newDrafts: Draft[] = entries.map(({ file: f }) => {
      const type = f.type;
      if (type.startsWith("image/")) {
        return {
          id: crypto.randomUUID(),
          file: f,
          url: URL.createObjectURL(f),
          kind: "image",
          name: f.name,
          size: fmtSize(f.size),
        };
      }
      if (type.startsWith("video/")) {
        return {
          id: crypto.randomUUID(),
          file: f,
          url: URL.createObjectURL(f),
          kind: "video",
          name: f.name,
          size: fmtSize(f.size),
        };
      }
      return {
        id: crypto.randomUUID(),
        file: f,
        url: URL.createObjectURL(f),
        kind: "file",
        name: f.name,
        size: fmtSize(f.size),
      };
    });
    setDrafts((d) => [...d, ...newDrafts]);
  };

  const addFiles = (files: FileList | File[], asFolder = false) => {
    const entries = Array.from(files).map((file) => {
      const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return { file, path };
    });
    addEntries(entries, asFolder);
  };

  const removeDraft = (id: string) => {
    setDrafts((current) => {
      const removed = current.find((draft) => draft.id === id);
      if (removed) revokePreview(removed);
      return current.filter((draft) => draft.id !== id);
    });
  };

  const clearAllDrafts = () => {
    drafts.forEach(revokePreview);
    setDrafts([]);
  };

  const handleDraftPreview = (d: Draft) => {
    if (d.kind === "image" || d.kind === "video") {
      onPreview({
        kind: d.kind,
        name: d.name,
        size: d.size,
        dims: d.kind === "image" ? "Ảnh" : "",
        duration: d.kind === "video" ? "Video" : "",
        url: d.url || "",
      });
    }
  };

  const handleAttachmentSend = async (d: Draft, now: string) => {
    const tempId = crypto.randomUUID();
    const optimisticAttachment: Attachment = {
      kind: d.kind,
      name: d.name,
      size: d.size,
      url: d.url || "",
    } as Attachment;

    onSend({
      id: tempId,
      author: currentUserId,
      time: now,
      status: "sending",
      attachment: optimisticAttachment,
    });

    if (d.url) retainedPreviewUrls.current.add(d.url);

    try {
      let fileToUpload: File;
      if (d.kind === "folder") {
        if (!d.sourceFiles?.length) {
          throw new Error("Thư mục này không có tệp nguồn.");
        }
        const blob = await zipFolderToBlob(d.sourceFiles);
        fileToUpload = new File([blob], `${d.name}.zip`, { type: "application/zip" });
      } else {
        if (!d.file) throw new Error("Tệp đính kèm không hợp lệ.");
        fileToUpload = d.file;
      }

      const uploaded = await uploadFile(fileToUpload, conversationId, (progress) => {
        updateMessage(tempId, {
          attachment: { ...optimisticAttachment, uploadProgress: progress.percent } as Attachment,
        });
      });

      const finalAttachment = buildAttachment(uploaded, fileToUpload);
      if (d.kind === "folder") {
        const folderAttachment = finalAttachment as unknown as Extract<
          Attachment,
          { kind: "folder" }
        >;
        folderAttachment.kind = "folder";
        folderAttachment.files = parseInt(d.meta ?? "0");
        folderAttachment.children = d.folderFiles ?? [];
      }

      updateMessage(tempId, { attachment: finalAttachment, status: "sent" });
    } catch (err) {
      updateMessage(tempId, { status: "failed" });
      toast.error(err instanceof Error ? err.message : "Không thể tải tệp lên.");
    }
  };

  const submit = () => {
    if (!text.trim() && drafts.length === 0) return;
    const now = new Date().toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    });

    if (text.trim()) {
      onSend({
        id: crypto.randomUUID(),
        author: currentUserId,
        time: now,
        text: text.trim(),
        status: "sent",
      });
    }

    drafts.forEach((d) => {
      handleAttachmentSend(d, now);
    });

    setText("");
    setDrafts([]);
    taRef.current?.focus();
  };

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col"
      onDragEnter={(e) => {
        e.preventDefault();
        dragCounter.current++;
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={() => {
        dragCounter.current--;
        if (dragCounter.current <= 0) setDragging(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        dragCounter.current = 0;
        setDragging(false);
        const files = await getDroppedFiles(e.dataTransfer.items);
        const containsDirectory = files.some((file) => file.path.includes("/"));
        addEntries(files, containsDirectory);
      }}
    >
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-8 py-6">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          <DayDivider label="Hôm nay" />
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageRow key={m.id} m={m} onPreview={onPreview} currentUserId={currentUserId} />
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence>
        {dragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="pointer-events-none absolute inset-4 z-20 grid place-items-center"
          >
            <div className="absolute inset-0 rounded-3xl border-2 border-dashed border-primary/60 bg-background/70 backdrop-blur-sm" />
            <motion.div
              initial={{ scale: 0.94 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.94 }}
              transition={springSoft}
              className="relative flex flex-col items-center gap-2 text-center"
            >
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-primary-foreground">
                <Paperclip size={22} />
              </div>
              <div className="text-lg font-semibold">Thả để đính kèm</div>
              <div className="text-sm text-muted-foreground">
                File và cả thư mục — Chatify giữ nguyên bản gốc
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Composer
        text={text}
        setText={setText}
        drafts={drafts}
        removeDraft={removeDraft}
        addFiles={addFiles}
        onSubmit={submit}
        taRef={taRef}
        clearAll={clearAllDrafts}
        onPreview={handleDraftPreview}
      />
    </div>
  );
}

function DayDivider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-4 text-[11px] uppercase tracking-wider text-muted-foreground">
      <div className="h-px flex-1 bg-border" />
      <span>{label}</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

/* ============================== MESSAGE ROW ============================== */
function MessageRow({
  m,
  onPreview,
  currentUserId,
}: {
  m: Message;
  onPreview: (att: Attachment) => void;
  currentUserId: string;
}) {
  const isMe = m.author === currentUserId;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={springSoft}
      className={`flex w-full ${isMe ? "justify-end" : "justify-start"}`}
    >
      <div className={`flex max-w-[560px] flex-col gap-1 ${isMe ? "items-end" : "items-start"}`}>
        {m.text && !m.attachment && (
          <div
            className={`whitespace-pre-wrap rounded-[20px] px-4 py-2.5 text-[14.5px] leading-relaxed ${
              isMe
                ? "bg-primary text-primary-foreground rounded-br-md"
                : "bg-surface text-foreground rounded-bl-md"
            }`}
          >
            {m.text}
          </div>
        )}
        {m.attachment && (
          <AttachmentView att={m.attachment} isMe={isMe} onPreview={onPreview} status={m.status} />
        )}
        <div className="mt-0.5 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
          <span>{m.time}</span>
          {isMe && m.status === "read" && <CheckCheck size={13} className="text-primary" />}
          {isMe && m.status === "delivered" && <CheckCheck size={13} />}
          {isMe && m.status === "sent" && <Check size={13} />}
          {isMe && m.status === "local" && <span>trên thiết bị này</span>}
        </div>
      </div>
    </motion.div>
  );
}

/* ======================== MEDIA GRID ITEM (extracted to fix hook rules) ==== */
function MediaGridItem({
  m,
  itemV,
  onPreview,
}: {
  m: Message;
  itemV: { hidden: { opacity: number; scale: number }; show: { opacity: number; scale: number } };
  onPreview: (att: Attachment) => void;
}) {
  const a = m.attachment!;
  const isVideo = a.kind === "video";
  const isMockVideo = a.kind === "video" && !a.source && a.poster?.startsWith("data:");
  const rawSrc =
    a.kind === "image" ? a.url || "" : a.kind === "video" ? a.poster || a.url || "" : "";
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);

  return (
    <motion.div
      variants={itemV}
      whileHover={{ scale: 1.04, y: -2 }}
      onClick={() => onPreview(a)}
      className="aspect-square overflow-hidden rounded-xl bg-surface shadow-sm cursor-pointer relative"
    >
      {a.kind === "image" || isMockVideo ? (
        <img src={src} alt="" className="h-full w-full object-cover" onError={refreshSrc} />
      ) : (
        <video
          src={src}
          className="h-full w-full object-cover"
          preload="metadata"
          muted
          onError={refreshSrc}
        />
      )}
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Play size={14} className="fill-white text-white" />
        </div>
      )}
    </motion.div>
  );
}

/* ============================== ATTACHMENTS ============================== */
function AttachmentView({
  att,
  isMe,
  onPreview,
  status,
}: {
  att: Attachment;
  isMe: boolean;
  onPreview: (att: Attachment) => void;
  status?: string;
}) {
  if (att.kind === "image" || att.kind === "video") {
    return <TicketStub att={att} onPreview={onPreview} status={status} />;
  }
  if (att.kind === "folder") {
    return <FolderCard att={att} />;
  }
  return <FileCard att={att} isMe={isMe} />;
}

function TicketStub({
  att,
  onPreview,
  status,
}: {
  att: Extract<Attachment, { kind: "image" | "video" }>;
  onPreview: (att: Attachment) => void;
  status?: string;
}) {
  const isMockVideo = att.kind === "video" && !att.source && att.poster?.startsWith("data:");
  const rawSrc = att.kind === "image" ? att.url || "" : att.poster || att.url || "";
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);
  const meta = att.kind === "image" ? `${att.dims} · ${att.size}` : `${att.duration} · ${att.size}`;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2, ease: EASE }}
      className="w-[380px] overflow-hidden rounded-[22px] bg-surface shadow-xl shadow-black/20"
    >
      <div
        className="relative cursor-pointer h-56 w-full overflow-hidden bg-muted"
        onClick={() => onPreview(att)}
      >
        {att.kind === "image" ? (
          <img
            src={src}
            alt={att.name}
            className="h-full w-full object-cover"
            onError={refreshSrc}
          />
        ) : isMockVideo ? (
          <img
            src={src}
            alt={att.name}
            className="h-full w-full object-cover"
            onError={refreshSrc}
          />
        ) : (
          <video
            src={src}
            className="h-full w-full object-cover"
            preload="metadata"
            muted
            playsInline
            onError={refreshSrc}
          />
        )}
        {att.kind === "video" && (
          <div className="absolute inset-0 grid place-items-center bg-black/10">
            <motion.div
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.94 }}
              className="grid h-14 w-14 place-items-center rounded-full bg-background/85 backdrop-blur"
            >
              <Play size={22} className="translate-x-0.5 fill-foreground text-foreground" />
            </motion.div>
          </div>
        )}
        {status === "sending" && att.uploadProgress !== undefined && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
            <div
              className="h-full bg-primary transition-all duration-200"
              style={{ width: `${att.uploadProgress}%` }}
            />
          </div>
        )}
      </div>
      <div className="ticket-perf h-3.5" />
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-medium">{att.name}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {att.url && !att.url.startsWith("blob:")
              ? "Đã lưu trên máy chủ"
              : att.source
                ? "Bản gốc (phiên này)"
                : "Tệp mẫu"}{" "}
            · {meta}
          </div>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.94 }}
          onClick={async () => {
            try {
              await downloadAttachment(att);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
            }
          }}
          title="Tải tệp gốc"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-[12.5px] font-medium text-primary-foreground"
        >
          <Download size={14} /> Tải gốc
        </motion.button>
      </div>
    </motion.div>
  );
}

function FileCard({ att, isMe }: { att: Extract<Attachment, { kind: "file" }>; isMe: boolean }) {
  return (
    <motion.div
      whileHover={{ y: -1 }}
      className={`flex w-[320px] items-center gap-3 rounded-2xl px-3.5 py-3 ${
        isMe ? "bg-primary/15" : "bg-surface"
      }`}
    >
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
        <FileText size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-medium">{att.name}</div>
        <div className="mt-0.5 text-[11.5px] uppercase tracking-wider text-muted-foreground">
          {att.ext} · {att.size}
        </div>
      </div>
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={async () => {
          try {
            await downloadAttachment(att);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
          }
        }}
        title="Tải tệp gốc"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-background/60 hover:text-foreground"
        aria-label="Tải"
      >
        <Download size={16} />
      </motion.button>
    </motion.div>
  );
}

function FolderCard({ att }: { att: Extract<Attachment, { kind: "folder" }> }) {
  const [open, setOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError("");
    try {
      if (att.sourceFiles?.length) {
        await downloadFolder(att.sourceFiles, att.name);
      } else if (att.url) {
        await downloadAttachment(att);
      } else {
        setDownloadError(
          "Thư mục này không còn khả dụng để tải (dữ liệu gốc đã mất sau khi tải lại trang).",
        );
        return;
      }
    } catch (error) {
      setDownloadError(error instanceof Error ? error.message : "Không thể tạo tệp ZIP.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <motion.div layout className="w-[380px] overflow-hidden rounded-[22px] bg-surface">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/20 text-primary">
          <Folder size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{att.name}</div>
          <div className="mt-0.5 text-[11.5px] text-muted-foreground">
            {att.files} tệp · {att.size}
          </div>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2, ease: EASE }}>
          <ChevronDown size={18} className="text-muted-foreground" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-2 py-2">
              {att.children.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl px-2.5 py-2 text-[13px] hover:bg-background/50"
                >
                  <span className="truncate text-foreground/90">{c.name}</span>
                  <span className="shrink-0 text-[11.5px] text-muted-foreground">{c.size}</span>
                </div>
              ))}
              <button
                onClick={handleDownload}
                disabled={downloading}
                title="Tạo ZIP không nén từ các tệp gốc"
                className="mt-1 flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-primary hover:bg-primary/10"
              >
                <Download size={13} /> {downloading ? "Đang chuẩn bị…" : "Tải cả thư mục"}
              </button>
              {downloadError && (
                <p role="alert" className="px-3 pb-1 text-[11px] text-destructive">
                  {downloadError}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/* ================================= COMPOSER ============================== */
function Composer({
  text,
  setText,
  drafts,
  removeDraft,
  addFiles,
  onSubmit,
  taRef,
  clearAll,
  onPreview,
}: {
  text: string;
  setText: (v: string) => void;
  drafts: Draft[];
  removeDraft: (id: string) => void;
  addFiles: (f: FileList | File[], asFolder?: boolean) => void;
  onSubmit: () => void;
  taRef: React.RefObject<HTMLTextAreaElement | null>;
  clearAll: () => void;
  onPreview: (d: Draft) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "0px";
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
  }, [text, taRef]);

  return (
    <div className="shrink-0 px-6 pb-3 pt-1">
      <div className="mx-auto max-w-3xl">
        <AnimatePresence>
          {drafts.length > 0 && (
            <motion.div
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="mb-2 flex flex-col gap-2 rounded-2xl border border-border bg-surface/70 p-3 backdrop-blur"
            >
              <div className="flex items-center justify-between border-b border-border/40 pb-2 mb-1 px-1">
                <span className="text-[11.5px] font-medium text-muted-foreground">
                  Đang chuẩn bị gửi ({drafts.length} tệp)
                </span>
                <button
                  onClick={clearAll}
                  className="text-[11px] font-semibold text-primary hover:text-primary/80 transition-colors"
                >
                  Xoá tất cả
                </button>
              </div>
              <div className="scroll-thin max-h-48 overflow-y-auto flex flex-wrap gap-2 p-1">
                <AnimatePresence initial={false}>
                  {drafts.map((d) => (
                    <DraftChip
                      key={d.id}
                      d={d}
                      onRemove={() => removeDraft(d.id)}
                      onPreview={onPreview}
                    />
                  ))}
                </AnimatePresence>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="relative flex items-end gap-1.5 rounded-[20px] border border-border bg-surface px-1.5 py-1.5 shadow-[0_10px_40px_-20px_rgba(0,0,0,0.4)] transition-all focus-within:border-primary/40 focus-within:ring-4 focus-within:ring-primary/10">
          <div className="relative">
            <motion.button
              onClick={() => setMenuOpen((o) => !o)}
              whileTap={{ scale: 0.92 }}
              animate={{ rotate: menuOpen ? 45 : 0 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-background text-foreground hover:bg-background/70"
              aria-label="Đính kèm"
            >
              <Plus size={17} />
            </motion.button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.96 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.96 }}
                  transition={{ duration: 0.18, ease: EASE }}
                  className="absolute bottom-full left-0 z-30 mb-2 w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 shadow-2xl"
                >
                  {[
                    { icon: ImageIcon, label: "Ảnh & video", ref: imgInputRef },
                    { icon: FileText, label: "Tệp tài liệu", ref: fileInputRef },
                    { icon: Folder, label: "Cả thư mục", ref: folderInputRef },
                  ].map((it) => (
                    <button
                      key={it.label}
                      onClick={() => {
                        it.ref.current?.click();
                        setMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[13.5px] hover:bg-accent"
                    >
                      <it.icon size={16} className="text-primary" />
                      {it.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <textarea
            ref={taRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSubmit();
              }
            }}
            rows={1}
            placeholder="Soạn tin nhắn…"
            className="max-h-28 min-h-[22px] flex-1 resize-none bg-transparent px-2 py-1.5 text-[14px] leading-relaxed outline-none placeholder:text-muted-foreground"
          />

          <motion.button
            onClick={onSubmit}
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.9 }}
            disabled={!text.trim() && drafts.length === 0}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground shadow-md shadow-primary/30 transition-opacity disabled:opacity-40"
            aria-label="Gửi"
          >
            <Send size={15} className="-translate-x-0.5" />
          </motion.button>
        </div>

        <p className="mt-1.5 px-2 text-center text-[10.5px] text-muted-foreground">
          Enter để gửi · Shift + Enter xuống dòng · Kéo thả file/thư mục
        </p>

        <input
          ref={imgInputRef}
          type="file"
          multiple
          accept="image/*,video/*"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          // @ts-expect-error non-standard directory attribute
          webkitdirectory=""
          directory=""
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files, true)}
        />
      </div>
    </div>
  );
}

function DraftChip({
  d,
  onRemove,
  onPreview,
}: {
  d: Draft;
  onRemove: () => void;
  onPreview: (d: Draft) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.7, y: 15 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.8, y: -10 }}
      transition={{ type: "spring", stiffness: 350, damping: 22 }}
      className="group relative overflow-hidden rounded-xl bg-background cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow"
      onClick={() => onPreview(d)}
    >
      {d.kind === "image" && d.url ? (
        <div className="relative h-16 w-24">
          <img src={d.url} alt={d.name} className="h-full w-full object-cover select-none" />
        </div>
      ) : d.kind === "video" && d.url ? (
        <div className="relative h-16 w-24">
          <video src={d.url} className="h-full w-full object-cover select-none" />
          <div className="absolute inset-0 grid place-items-center bg-black/30">
            <Play size={16} className="fill-white text-white" />
          </div>
        </div>
      ) : (
        <div className="flex h-16 items-center gap-2 px-3 pr-8 select-none">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
            {d.kind === "folder" ? <Folder size={16} /> : <FileText size={16} />}
          </div>
          <div className="min-w-0">
            <div className="max-w-[140px] truncate text-[12px] font-medium">{d.name}</div>
            <div className="text-[10.5px] text-muted-foreground">
              {d.meta ? `${d.meta} · ${d.size}` : d.size}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-background/80 text-foreground opacity-90 hover:bg-background"
        aria-label="Xoá đính kèm"
      >
        <X size={12} />
      </button>
    </motion.div>
  );
}

/* ============================ MEMBER ACTIONS ============================= */
function MemberRowActions({ member, convId }: { member: Member; convId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const updateMemberRoleMutation = useUpdateMemberRole();
  const removeMemberMutation = useRemoveMember();

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const toggleAdmin = () => {
    const newRole = member.role === "admin" ? "member" : "admin";
    updateMemberRoleMutation.mutate({ convId, memberId: member.id, role: newRole });
    setIsOpen(false);
  };

  const kickMember = () => {
    removeMemberMutation.mutate({ convId, memberId: member.id });
    setIsOpen(false);
  };

  return (
    <div ref={menuRef} className="relative ml-auto">
      <motion.button
        type="button"
        whileHover={{ scale: 1.15 }}
        whileTap={{ scale: 0.85 }}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-surface-2 hover:text-foreground transition-colors"
      >
        <MoreHorizontal size={14} />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: -4 }}
            transition={{ type: "spring", stiffness: 400, damping: 26 }}
            className="absolute right-0 top-[calc(100%+4px)] z-50 w-40 overflow-hidden rounded-xl border border-border bg-surface shadow-xl"
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleAdmin();
              }}
              className="flex w-full items-center px-3 py-2 text-[12px] text-left hover:bg-surface-2 transition-colors text-foreground"
            >
              {member.role === "admin" ? "Bãi nhiệm phó nhóm" : "Bổ nhiệm phó nhóm"}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                kickMember();
              }}
              className="flex w-full items-center px-3 py-2 text-[12px] text-left hover:bg-surface-2 transition-colors text-destructive"
            >
              Xoá khỏi nhóm
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================== DETAIL PANEL ============================= */
function DetailPanel({
  conv,
  messages,
  onPreview,
  onInvite,
  onViewProfile,
  onLeaveGroup,
  session,
}: {
  conv: Conversation;
  messages: Message[];
  onPreview: (att: Attachment) => void;
  onInvite: () => void;
  onViewProfile: (m: Member) => void;
  onLeaveGroup: () => void;
  session: AuthUser;
}) {
  const isGroup =
    conv.isGroup ||
    String(conv.id).startsWith("g_") ||
    conv.name?.includes("Nhóm") ||
    conv.name?.includes("Đội");
  const [tab, setTab] = useState<"media" | "files" | "members">("media");
  const media = messages.filter(
    (m) => m.attachment?.kind === "image" || m.attachment?.kind === "video",
  );
  const files = messages.filter(
    (m) => m.attachment?.kind === "file" || m.attachment?.kind === "folder",
  );

  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05, delayChildren: 0.05 } },
  };
  const itemV = {
    hidden: { opacity: 0, y: 14, scale: 0.94 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { type: "spring" as const, stiffness: 320, damping: 24 },
    },
  };

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 320, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={springSidebar}
      className="scroll-thin shrink-0 overflow-hidden border-l border-border bg-background/55 backdrop-blur-xl"
    >
      <div className="scroll-thin flex h-full w-[320px] min-w-[320px] flex-col overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, ...springSoft }}
          className="flex flex-col items-center gap-3 px-6 pb-4 pt-8"
        >
          <img
            src={conv.avatar}
            alt={conv.name}
            className="h-20 w-20 rounded-full animate-pop-punch"
          />
          <div className="text-center">
            <div className="text-[16px] font-semibold">{conv.name}</div>
            <div className="mt-0.5 text-[12px] text-muted-foreground">
              {isGroup
                ? `${messages.length} tin nhắn`
                : conv.presence === "online"
                  ? "Đang hoạt động"
                  : "Ngoại tuyến"}
            </div>
            {isGroup && (
              <div className="mt-3 flex items-center justify-center gap-2">
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onInvite}
                  className="flex items-center gap-1.5 rounded-full bg-primary/10 px-4 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary/20 transition-colors"
                >
                  <UserPlus size={13} /> Tạo mã mời nhóm
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onLeaveGroup}
                  className="flex items-center gap-1.5 rounded-full bg-destructive/10 px-4 py-1.5 text-[12px] font-semibold text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <LogOut size={13} /> Rời nhóm
                </motion.button>
              </div>
            )}
          </div>
        </motion.div>

        <div className="mx-4 mb-4 grid grid-cols-3 gap-1 rounded-full bg-surface p-1 text-[12.5px]">
          {(
            [
              { k: "media", l: "Media" },
              { k: "files", l: "Tệp" },
              { k: "members", l: "Thành viên" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className="relative rounded-full px-3 py-1.5 font-medium"
            >
              {tab === t.k && (
                <motion.span
                  layoutId="tab-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span
                className={`relative ${
                  tab === t.k ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {t.l}
              </span>
            </button>
          ))}
        </div>

        <div className="px-4 pb-6">
          <AnimatePresence mode="wait">
            {tab === "media" && (
              <motion.div
                key="media"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="grid grid-cols-3 gap-1.5"
              >
                {media.length === 0 ? (
                  <EmptyHint text="Chưa có ảnh/video" />
                ) : (
                  media.map((m) => (
                    <MediaGridItem key={m.id} m={m} itemV={itemV} onPreview={onPreview} />
                  ))
                )}
              </motion.div>
            )}

            {tab === "files" && (
              <motion.div
                key="files"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col gap-1.5"
              >
                {files.length === 0 ? (
                  <EmptyHint text="Chưa có tệp nào" />
                ) : (
                  files.map((m) => {
                    const a = m.attachment!;
                    return (
                      <motion.div
                        key={m.id}
                        variants={itemV}
                        whileHover={{ x: 3 }}
                        onClick={async () => {
                          try {
                            await downloadAttachment(a);
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Không thể tải tệp xuống.",
                            );
                          }
                        }}
                        className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 cursor-pointer hover:bg-surface-2 transition-colors"
                      >
                        <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
                          {a.kind === "folder" ? <Folder size={16} /> : <FileText size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">
                            {a.kind === "folder" || a.kind === "file" ? a.name : ""}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.kind === "folder"
                              ? `${a.files} tệp · ${a.size}`
                              : a.kind === "file"
                                ? `${a.ext.toUpperCase()} · ${a.size}`
                                : ""}
                          </div>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </motion.div>
            )}

            {tab === "members" && (
              <motion.div
                key="members"
                variants={stagger}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, y: 8 }}
                className="flex flex-col gap-1.5"
              >
                {(() => {
                  const members: Member[] = conv.isGroup
                    ? conv.members || []
                    : [
                        {
                          id: "them",
                          name: conv.name,
                          avatar: conv.avatar,
                          role: "member" as const,
                        },
                        {
                          id: session.id,
                          name: session.name,
                          avatar: session.avatar,
                          role: "member" as const,
                        },
                      ];
                  const myMember = (conv.members || []).find((m) => m.id === session.id);
                  const isOwner = myMember?.role === "owner";

                  return (
                    <>
                      <div className="px-2 py-1 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                        Danh sách ({members.length})
                      </div>
                      {members.map((m, i) => (
                        <motion.div
                          key={m.id || i}
                          variants={itemV}
                          whileHover={{ x: 3 }}
                          onClick={() => onViewProfile(m)}
                          className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5 cursor-pointer hover:bg-surface-2 transition-all"
                        >
                          <img
                            src={m.avatar}
                            alt={m.name}
                            className="h-9 w-9 rounded-full object-cover"
                          />
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="text-[13px] font-medium flex items-center gap-1.5 truncate">
                              <span className="truncate">{m.name}</span>
                              {conv.isGroup && m.role === "owner" && (
                                <span className="rounded bg-amber-500/10 px-1.5 py-0.2 text-[8px] font-bold text-amber-500 uppercase tracking-wide shrink-0">
                                  Trưởng nhóm
                                </span>
                              )}
                              {conv.isGroup && m.role === "admin" && (
                                <span className="rounded bg-indigo-500/10 px-1.5 py-0.2 text-[8px] font-bold text-indigo-500 uppercase tracking-wide shrink-0">
                                  Phó nhóm
                                </span>
                              )}
                            </div>
                            {m.id !== session.id && (
                              <div className="text-[10px] text-muted-foreground truncate">
                                @{m.name.toLowerCase().replace(/\s+/g, "")}
                              </div>
                            )}
                          </div>

                          {conv.isGroup && isOwner && m.id !== session.id && (
                            <MemberRowActions member={m} convId={conv.id} />
                          )}
                        </motion.div>
                      ))}
                    </>
                  );
                })()}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  );
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div className="col-span-full rounded-2xl border border-dashed border-border p-6 text-center text-[12.5px] text-muted-foreground">
      {text}
    </div>
  );
}

/* ============================== PREVIEW MODAL ============================= */
function PreviewModal({
  open,
  onClose,
  att,
}: {
  open: boolean;
  onClose: () => void;
  att: Attachment | null;
}) {
  const isImage = att?.kind === "image";
  const isVideo = att?.kind === "video";
  const rawSrc = isImage ? att?.url : att?.kind === "video" ? att?.poster || att?.url : undefined;
  const { url: src, refresh: refreshSrc } = useAttachmentUrl(rawSrc);

  return (
    <AnimatePresence>
      {open && att && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/90 p-4 backdrop-blur-md"
        >
          <button
            onClick={onClose}
            className="absolute right-6 top-6 grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
            aria-label="Đóng"
          >
            <X size={24} />
          </button>

          <div className="relative max-h-[80vh] max-w-[90vw] overflow-hidden rounded-2xl flex items-center justify-center">
            {isImage ? (
              <img
                src={src}
                alt={att.name}
                className="max-h-[80vh] max-w-[90vw] object-contain select-none shadow-2xl"
                onError={refreshSrc}
              />
            ) : isVideo ? (
              <video
                src={src}
                className="max-h-[80vh] max-w-[90vw] object-contain"
                controls
                autoPlay
                preload="metadata"
                onError={refreshSrc}
              />
            ) : null}
          </div>

          <div className="mt-6 flex flex-col items-center text-center text-white">
            <div className="text-lg font-semibold">{att.name}</div>
            <div className="mt-1 text-sm text-white/60">
              {att.kind === "image"
                ? `${att.dims} · ${att.size}`
                : att.kind === "video"
                  ? `${att.duration} · ${att.size}`
                  : att.size}
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={async () => {
                try {
                  await downloadAttachment(att);
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Không thể tải file này.");
                }
              }}
              className="mt-4 flex items-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg"
            >
              <Download size={16} /> Tải chất lượng gốc
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ============================ CREATE CHAT MODAL =========================== */
function CreateChatModal({
  open,
  onClose,
  initialTab = "create",
  onCreate,
  onJoin,
  onFriendRequestSuccess,
  friends,
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: "create" | "join";
  onCreate: (
    name: string,
    isGroup: boolean,
    presence: "online" | "away" | "offline",
    desc: string,
    memberIds?: string[],
  ) => void;
  onJoin: (groupId: string, name: string) => void;
  onFriendRequestSuccess?: () => void;
  friends: Friend[];
}) {
  const [activeTab, setActiveTab] = useState<"create" | "join">("create");
  const [selectedMemberIds, setSelectedMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      setSelectedMemberIds([]);
      // Reset request states
      setSearchResult(null);
      setJoinError("");
      setSearchVal("");
      setFriendMsg("Chào bạn, mình kết bạn nhé!");
      setShowFriendMsgForm(false);
      setSendingRequest(false);
      setRequestSuccess(false);
    }
  }, [open, initialTab]);

  // Create states
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");

  // Join states
  const [searchVal, setSearchVal] = useState("");
  const [joinError, setJoinError] = useState("");
  const [searchResult, setSearchResult] = useState<import("@/lib/types").SearchResult | null>(null);

  // Friend request states
  const [showFriendMsgForm, setShowFriendMsgForm] = useState(false);
  const [friendMsg, setFriendMsg] = useState("Chào bạn, mình kết bạn nhé!");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [requestSuccess, setRequestSuccess] = useState(false);

  if (!open) return null;

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    // Always creates a Group Chat when using Create tab
    onCreate(name.trim(), true, "online", desc.trim(), selectedMemberIds);
    setName("");
    setDesc("");
    setSelectedMemberIds([]);
    onClose();
  };

  const handleSearchOrJoin = async () => {
    const term = searchVal.trim();
    if (!term) return;

    setJoinError("");
    setSearchResult(null);
    setShowFriendMsgForm(false);

    try {
      const result = await searchUsers(term);
      if (result) {
        setSearchResult(result);
      } else {
        setJoinError("Không tìm thấy kết quả phù hợp.");
      }
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : "Đã xảy ra lỗi khi tìm kiếm.");
    }
  };

  const handleExecuteJoin = async () => {
    if (!searchResult) return;
    if (searchResult.type === "group" && searchResult.groupId) {
      try {
        await incrementInviteUsage(searchVal);
      } catch (e) {
        console.error("Lỗi khi cập nhật lượt dùng mã mời:", e);
      }
      onJoin(searchResult.groupId, searchResult.name);
      setSearchVal("");
      setSearchResult(null);
      onClose();
    } else {
      // Create user chat (Private conversation)
      onCreate(searchResult.name, false, "online", "");
      setSearchVal("");
      setSearchResult(null);
      onClose();
    }
  };
  const handleSendFriendRequest = async () => {
    if (!searchResult || searchResult.type !== "user") return;
    setSendingRequest(true);

    try {
      await sendFriendRequest(searchResult.id, friendMsg);
      setSendingRequest(false);
      setRequestSuccess(true);

      // After success animation, add the friend to list and trigger callback
      setTimeout(() => {
        onCreate(searchResult.name, false, "online", "");
        onClose();
        if (onFriendRequestSuccess) {
          onFriendRequestSuccess();
        }
      }, 1200);
    } catch (err) {
      setSendingRequest(false);
      setJoinError(err instanceof Error ? err.message : "Không thể gửi lời mời kết bạn.");
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 grid place-items-center p-4 bg-background/60 backdrop-blur-xl"
      >
        <motion.div className="absolute inset-0" onClick={onClose} />
        <motion.div
          layout="position"
          initial={{ opacity: 0, y: 16, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.97 }}
          transition={{
            type: "spring",
            stiffness: 240,
            damping: 26,
            layout: { type: "spring", stiffness: 240, damping: 28 },
          }}
          className="relative w-full max-w-md overflow-hidden rounded-3xl border border-border bg-surface p-6 shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/40 pb-3 mb-4">
            <h3 className="text-base font-semibold">Thêm hội thoại mới</h3>
            <button
              onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-surface-2 hover:text-foreground"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tabs */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1 text-[13px]">
            <button
              onClick={() => {
                setActiveTab("create");
                setSearchResult(null);
                setJoinError("");
              }}
              className={`relative rounded-full py-2 font-medium transition-colors ${
                activeTab === "create"
                  ? "text-primary-foreground font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              {activeTab === "create" && (
                <motion.span
                  layoutId="modal-tab-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">Tạo nhóm</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("join");
                setSearchResult(null);
                setJoinError("");
              }}
              className={`relative rounded-full py-2 font-medium transition-colors ${
                activeTab === "join"
                  ? "text-primary-foreground font-semibold"
                  : "text-muted-foreground"
              }`}
            >
              {activeTab === "join" && (
                <motion.span
                  layoutId="modal-tab-pill"
                  className="absolute inset-0 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative">Tìm bạn / Nhập mã</span>
            </button>
          </div>

          {/* Tab Content Wrapper */}
          <motion.div layout="position" className="flex flex-col gap-4">
            <AnimatePresence mode="popLayout">
              {activeTab === "create" ? (
                <motion.form
                  key="create-group-form"
                  layout="position"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.2 }}
                  onSubmit={handleCreateSubmit}
                  className="flex flex-col gap-4"
                >
                  <ModalField label="Tên nhóm chat mới">
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ví dụ: Nhóm thiết kế UI/UX, Đội dự án..."
                      className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                    />
                  </ModalField>

                  <ModalField label="Mô tả nhóm (không bắt buộc)">
                    <input
                      value={desc}
                      onChange={(e) => setDesc(e.target.value)}
                      placeholder="Mô tả mục đích nhóm này..."
                      className="w-full bg-transparent text-[14px] outline-none placeholder:opacity-40"
                    />
                  </ModalField>

                  <div className="flex flex-col gap-2">
                    <div className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Chọn thành viên ({selectedMemberIds.length})
                    </div>
                    <div className="max-h-32 overflow-y-auto rounded-xl border border-border/40 bg-surface-2/50 p-2 flex flex-col gap-1.5 scrollbar-thin">
                      {friends.length === 0 ? (
                        <div className="text-[13px] text-muted-foreground text-center py-4">
                          Chưa có bạn bè để thêm
                        </div>
                      ) : (
                        friends.map((f) => {
                          const isChecked = selectedMemberIds.includes(f.id);
                          return (
                            <label
                              key={f.id}
                              className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface-2 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => {
                                  if (isChecked) {
                                    setSelectedMemberIds(
                                      selectedMemberIds.filter((id) => id !== f.id),
                                    );
                                  } else {
                                    setSelectedMemberIds([...selectedMemberIds, f.id]);
                                  }
                                }}
                                className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                              />
                              <img
                                src={f.avatar}
                                className="h-6 w-6 rounded-full object-cover"
                                alt={f.name}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-[13.5px] font-medium truncate">{f.name}</div>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>

                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-border bg-surface-2 px-4 py-2 text-[13px] font-medium hover:bg-surface"
                    >
                      Huỷ
                    </button>
                    <button
                      type="submit"
                      className="rounded-full bg-primary px-5 py-2 text-[13px] font-semibold text-primary-foreground shadow-lg"
                    >
                      Tạo ngay
                    </button>
                  </div>
                </motion.form>
              ) : (
                <motion.div
                  key="join-group-form"
                  layout="position"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -12 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-4"
                >
                  <div className="flex flex-col gap-2">
                    <ModalField label="Mã mời, SĐT hoặc @username">
                      <div className="relative flex gap-2">
                        <input
                          value={searchVal}
                          onChange={(e) => setSearchVal(e.target.value)}
                          placeholder="Ví dụ: 1234567890 hoặc @nguyenvana..."
                          className="flex-1 bg-transparent text-[14px] outline-none placeholder:opacity-40"
                          onKeyDown={(e) => e.key === "Enter" && handleSearchOrJoin()}
                        />
                        <button
                          onClick={handleSearchOrJoin}
                          className="rounded-xl bg-primary px-4 py-1.5 text-[12px] font-semibold text-primary-foreground shadow-md shrink-0"
                        >
                          Tìm
                        </button>
                      </div>
                    </ModalField>
                    {joinError && (
                      <div className="text-xs font-medium text-destructive px-1">{joinError}</div>
                    )}
                  </div>

                  {/* Bouncy Search result card & Friend Request flows */}
                  <AnimatePresence mode="wait">
                    {sendingRequest && (
                      <motion.div
                        key="sending-loader"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="mt-3 flex flex-col items-center justify-center p-6 border border-border rounded-2xl bg-surface-2"
                      >
                        <svg
                          className="animate-spin h-8 w-8 text-primary mb-3"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        <div className="text-sm font-medium text-muted-foreground">
                          Đang gửi lời mời kết bạn...
                        </div>
                      </motion.div>
                    )}

                    {requestSuccess && (
                      <motion.div
                        key="success-checkmark"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="mt-3 flex flex-col items-center justify-center p-6 border border-emerald-500/20 rounded-2xl bg-emerald-500/5 text-center"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 300, damping: 15 }}
                          className="grid h-12 w-12 place-items-center rounded-full bg-emerald-500 text-white mb-3 shadow-lg shadow-emerald-500/20"
                        >
                          <Check size={24} strokeWidth={3} />
                        </motion.div>
                        <div className="text-sm font-bold text-emerald-400">
                          Đã gửi lời mời thành công!
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Đang chuyển về danh sách bạn bè...
                        </div>
                      </motion.div>
                    )}

                    {!sendingRequest && !requestSuccess && searchResult && (
                      <motion.div
                        key={searchResult.name}
                        initial={{ opacity: 0, scale: 0.93, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.93, y: -10 }}
                        transition={{ type: "spring", stiffness: 350, damping: 20 }}
                        className="mt-3 flex flex-col gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[14px] font-bold text-primary truncate flex items-center gap-1.5">
                              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                              {searchResult.name}
                            </div>
                            {searchResult.type === "group" ? (
                              <div className="text-[11.5px] text-muted-foreground mt-0.5">
                                Nhóm trò chuyện được tìm thấy bằng mã mời
                              </div>
                            ) : (
                              <div className="text-[11.5px] text-muted-foreground mt-0.5 flex flex-col gap-0.5">
                                {searchResult.username && (
                                  <span>Tài khoản: {searchResult.username}</span>
                                )}
                                {searchResult.phone && <span>SĐT: {searchResult.phone}</span>}
                              </div>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            {searchResult.type === "user" && !showFriendMsgForm && (
                              <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={() => setShowFriendMsgForm(true)}
                                className="rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 text-[12px] font-bold text-primary hover:bg-primary/20 transition-colors"
                              >
                                Kết bạn
                              </motion.button>
                            )}
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={handleExecuteJoin}
                              className="rounded-full bg-primary px-4 py-2 text-[12px] font-bold text-primary-foreground shadow-md"
                            >
                              {searchResult.type === "group" ? "Tham gia" : "Nhắn tin"}
                            </motion.button>
                          </div>
                        </div>

                        {/* Slide-down friend request message box */}
                        <AnimatePresence>
                          {showFriendMsgForm && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="overflow-hidden border-t border-border/40 pt-3 mt-1 flex flex-col gap-3"
                            >
                              <ModalField label="Lời nhắn đính kèm">
                                <textarea
                                  value={friendMsg}
                                  onChange={(e) => setFriendMsg(e.target.value)}
                                  placeholder="Ví dụ: Xin chào, mình là..."
                                  rows={2}
                                  className="w-full resize-none bg-transparent text-[13px] outline-none placeholder:opacity-40"
                                />
                              </ModalField>
                              <div className="flex justify-end gap-1.5">
                                <button
                                  onClick={() => setShowFriendMsgForm(false)}
                                  className="rounded-full border border-border px-3 py-1.5 text-[12px] font-medium bg-transparent hover:bg-surface-2"
                                >
                                  Huỷ
                                </button>
                                <button
                                  onClick={handleSendFriendRequest}
                                  className="rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold text-primary-foreground shadow-md"
                                >
                                  Gửi lời mời
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="rounded-full border border-border bg-surface-2 px-5 py-2 text-[13px] font-medium hover:bg-surface"
                    >
                      Đóng
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  const [focused, setFocused] = useState(false);
  return (
    <motion.div
      animate={{
        scale: focused ? 1.015 : 1,
        borderColor: focused ? "rgba(245, 165, 125, 0.4)" : "rgba(255, 255, 255, 0.08)",
        boxShadow: focused
          ? "0 0 0 4px rgba(245, 165, 125, 0.1), 0 4px 12px rgba(0,0,0,0.1)"
          : "0 0 0 0px rgba(0,0,0,0), 0 2px 4px rgba(0,0,0,0.05)",
      }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      onFocusCapture={() => setFocused(true)}
      onBlurCapture={() => setFocused(false)}
      className="flex flex-col gap-1 rounded-2xl border border-border bg-surface-2 px-4 py-2"
    >
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      {children}
    </motion.div>
  );
}
