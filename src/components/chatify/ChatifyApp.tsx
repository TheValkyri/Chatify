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
import { EASE, springSoft, springSidebar } from "@/lib/animation";
import { Sidebar } from "./Sidebar";
import { ChatHeader } from "./ChatHeader";
import { ChatArea } from "./ChatArea";
import { Composer } from "./Composer";
import { DetailPanel } from "./DetailPanel";
import { MessageRow } from "./MessageRow";
import { PreviewModal } from "./PreviewModal";
import { CreateChatModal } from "./CreateChatModal";
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
/* --------------------------------- Utils --------------------------------- */


/* ------------------------------ Draft type ------------------------------- */
// Draft type is imported from @/lib/types — no longer defined here.

type Modal = null | "profile" | "settings" | "notifications" | "friends";
type LiquidPulse = { key: number; color: string; x: number; y: number } | null;

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

    const newId = crypto.randomUUID();
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
        currentUserId={session.id}
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
              handleCreateConversation(profileMember.name, false, "online", "", [profileMember.id]);
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
        currentUserId={session.id}
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


/* =============================== CHAT HEADER ============================= */


/* ================================ CHAT AREA ============================== */




/* ============================== MESSAGE ROW ============================== */


/* ======================== MEDIA GRID ITEM (extracted to fix hook rules) ==== */


/* ============================== ATTACHMENTS ============================== */


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




/* ============================ MEMBER ACTIONS ============================= */


/* ============================== DETAIL PANEL ============================= */




/* ============================== PREVIEW MODAL ============================= */


/* ============================ CREATE CHAT MODAL =========================== */



