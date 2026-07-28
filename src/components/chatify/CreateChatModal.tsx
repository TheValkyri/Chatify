import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { EASE, springSoft, springSidebar } from "@/lib/animation";
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
import { STORAGE_KEYS } from "@/lib/config";
import { toast } from "sonner";
import {
  downloadFile,
  downloadFolder,
  downloadAttachment,
  zipFolderToBlob,
  type OriginalFile,
} from "@/lib/file-transfer";
import { buildAttachment, uploadFile } from "@/lib/upload";
import { useAttachmentUrl } from "@/hooks/useAttachmentUrl";
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
import { LiquidTransition } from "./Modals";
import { searchUsers, joinViaInviteCode, sendFriendRequest } from "@/lib/api";
import { ModalField } from "./helpers";
import { ModalShell, ModalHeader } from "./Modals";
import { UserAvatar } from "./UserAvatar";

export function CreateChatModal({
  open,
  onClose,
  initialTab = "create",
  onCreate,
  onJoin,
  onFriendRequestSuccess,
  friends,
  session,
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
  session?: AuthUser;
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
        await joinViaInviteCode(searchVal, session?.name);
      } catch (e) {
        console.error("Lỗi khi tham gia bằng mã mời:", e);
      }
      onJoin(searchResult.groupId, searchResult.name);
      setSearchVal("");
      setSearchResult(null);
      onClose();
    } else if (searchResult.type === "user") {
      // Create user chat (Private conversation)
      onCreate(searchResult.name, false, "online", "", [searchResult.id]);
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
        onCreate(searchResult.name, false, "online", "", [searchResult.id]);
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
                              <UserAvatar
                                src={f.avatar}
                                name={f.name}
                                className="h-6 w-6 rounded-full"
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
