import type { Conversation, Member, Message, Attachment, MemberRole } from "./types";

type DbMember = {
  user_id: string;
  role: MemberRole;
  profiles?: { name: string; avatar: string; username: string } | null;
};

type DbConversation = {
  id: string;
  name: string;
  avatar: string | null;
  description: string | null;
  is_group: boolean;
  preview: string | null;
  unread: number;
  presence: string;
  updated_at?: string;
  conversation_members?: DbMember[];
};

type DbMessage = {
  id: string;
  conversation_id: string;
  author_id: string;
  text: string | null;
  attachment: unknown;
  created_at: string;
  message_reads?: { user_id: string }[];
};

export function mapMemberFromDb(row: DbMember): Member {
  return {
    id: row.user_id,
    name: row.profiles?.name ?? "Người dùng",
    avatar: row.profiles?.avatar ?? "",
    username: row.profiles?.username,
    role: row.role,
  };
}

export function mapConversationFromDb(row: DbConversation): Conversation {
  let time = "";
  if (row.updated_at) {
    const d = new Date(row.updated_at);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays === 0) {
      time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
    } else if (diffDays === 1) {
      time = "Hôm qua";
    } else if (diffDays < 7) {
      time = d.toLocaleDateString("vi-VN", { weekday: "short" });
    } else {
      time = d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" });
    }
  }

  return {
    id: row.id,
    name: row.name,
    avatar: row.avatar ?? "",
    preview: row.preview ?? "",
    time,
    unread: row.unread ?? 0,
    presence: (row.presence as Conversation["presence"]) ?? "offline",
    isGroup: row.is_group,
    description: row.description ?? undefined,
    members: (row.conversation_members ?? []).map(mapMemberFromDb),
  };
}

export function mapMessageFromDb(row: DbMessage): Message {
  const hasBeenRead = (row.message_reads ?? []).some((r) => r.user_id !== row.author_id);
  return {
    id: row.id,
    author: row.author_id,
    text: row.text ?? undefined,
    attachment: (row.attachment as Attachment) ?? undefined,
    time: new Date(row.created_at).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: hasBeenRead ? "read" : "sent",
  };
}
