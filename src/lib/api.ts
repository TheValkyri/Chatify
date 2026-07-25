// ─── Chatify — API Client ───────────────────────────────────────────────────
// Unified data access layer: Supabase in production, localStorage in demo.
// All business logic (conversations, messages, friends, etc.) goes through here.

import { IS_DEMO_MODE, STORAGE_KEYS } from "./config";
import { getSupabase } from "./supabase";
import { mapConversationFromDb, mapMessageFromDb } from "./mappers";
import type {
  Conversation,
  Member,
  Message,
  Friend,
  SearchResult,
  SearchResultUser,
  InviteCode,
  AuthUser,
  Profile,
} from "./types";

// ─── Error Class ────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Demo Mode Helpers ──────────────────────────────────────────────────────

function demoGet<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : fallback;
  } catch {
    return fallback;
  }
}

function demoSet(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

// ─── Conversations ──────────────────────────────────────────────────────────

export async function fetchConversations(): Promise<Conversation[]> {
  if (IS_DEMO_MODE) {
    return demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, conversation_members(user_id, role, profiles(name, avatar, username))")
    .order("updated_at", { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map(mapConversationFromDb);
}

export async function createConversation(conv: Conversation): Promise<Conversation> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    convs.push(conv);
    demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    return conv;
  }

  const supabase = getSupabase();

  // Use atomic RPC to create conversation + members in a single transaction
  const memberIds = conv.members.map((m) => m.id);
  const memberRoles = conv.members.map((m) => m.role);

  const { error: rpcError } = await supabase.rpc("create_conversation_atomic", {
    p_id: conv.id,
    p_name: conv.name,
    p_avatar: conv.avatar,
    p_is_group: conv.isGroup,
    p_description: conv.description ?? "",
    p_member_ids: memberIds,
    p_member_roles: memberRoles,
  });

  if (rpcError) throw new ApiError(500, rpcError.message);

  // SELECT back the fully-formed conversation
  const { data, error: selectError } = await supabase
    .from("conversations")
    .select("*, conversation_members(user_id, role, profiles(name, avatar, username))")
    .eq("id", conv.id)
    .single();

  if (selectError) throw new ApiError(500, selectError.message);

  return mapConversationFromDb(data);
}

export async function deleteConversation(convId: string): Promise<void> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    demoSet(
      STORAGE_KEYS.CONVERSATIONS,
      convs.filter((c) => c.id !== convId),
    );
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.from("conversations").delete().eq("id", convId);
  if (error) throw new ApiError(500, error.message);
}

export async function updateConversation(
  convId: string,
  updates: Partial<Conversation>,
): Promise<void> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const idx = convs.findIndex((c) => c.id === convId);
    if (idx >= 0) {
      convs[idx] = { ...convs[idx], ...updates };
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("conversations")
    .update({
      name: updates.name,
      avatar: updates.avatar,
      description: updates.description,
    })
    .eq("id", convId);
  if (error) throw new ApiError(500, error.message);
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function fetchMessages(
  convId: string,
  cursor?: string,
  limit = 50,
): Promise<Message[]> {
  if (IS_DEMO_MODE) {
    const all = demoGet<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES, {});
    return all[convId] ?? [];
  }

  const supabase = getSupabase();
  let query = supabase
    .from("messages")
    .select("*, message_reads(user_id)")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return (data ?? []).map(mapMessageFromDb).reverse();
}

export async function sendMessage(convId: string, msg: Message): Promise<Message> {
  if (IS_DEMO_MODE) {
    const all = demoGet<Record<string, Message[]>>(STORAGE_KEYS.MESSAGES, {});
    if (!all[convId]) all[convId] = [];
    all[convId].push({ ...msg, status: "sent" });
    demoSet(STORAGE_KEYS.MESSAGES, all);

    // Update conversation preview
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const idx = convs.findIndex((c) => c.id === convId);
    if (idx >= 0) {
      convs[idx] = {
        ...convs[idx],
        preview: msg.text || (msg.attachment ? `[${msg.attachment.kind}]` : ""),
        time: msg.time,
      };
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }

    return { ...msg, status: "sent" };
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("messages")
    .insert({
      id: msg.id,
      conversation_id: convId,
      author_id: msg.author,
      text: msg.text,
      attachment: msg.attachment ?? null,
    })
    .select()
    .single();

  if (error) throw new ApiError(500, error.message);
  return { ...msg, ...data, status: "sent" };
}

// ─── Members ────────────────────────────────────────────────────────────────

export async function updateMemberRole(
  convId: string,
  memberId: string,
  role: Member["role"],
): Promise<void> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const conv = convs.find((c) => c.id === convId);
    if (conv) {
      const member = conv.members.find((m) => m.id === memberId);
      if (member) member.role = role;
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("conversation_members")
    .update({ role })
    .match({ conversation_id: convId, user_id: memberId });
  if (error) throw new ApiError(500, error.message);
}

export async function removeMember(convId: string, memberId: string): Promise<void> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const conv = convs.find((c) => c.id === convId);
    if (conv) {
      conv.members = conv.members.filter((m) => m.id !== memberId);
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("conversation_members")
    .delete()
    .match({ conversation_id: convId, user_id: memberId });
  if (error) throw new ApiError(500, error.message);
}

export async function transferOwnership(
  convId: string,
  newOwnerId: string,
  currentOwnerId: string,
): Promise<void> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const conv = convs.find((c) => c.id === convId);
    if (conv) {
      conv.members = conv.members.map((m) => ({
        ...m,
        role: m.id === newOwnerId ? "owner" : m.id === currentOwnerId ? "member" : m.role,
      }));
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return;
  }

  const supabase = getSupabase();
  // Transaction: set new owner, demote current
  const { error: e1 } = await supabase
    .from("conversation_members")
    .update({ role: "owner" })
    .match({ conversation_id: convId, user_id: newOwnerId });
  if (e1) throw new ApiError(500, e1.message);

  const { error: e2 } = await supabase
    .from("conversation_members")
    .update({ role: "member" })
    .match({ conversation_id: convId, user_id: currentOwnerId });
  if (e2) throw new ApiError(500, e2.message);
}

// ─── Friends ────────────────────────────────────────────────────────────────

export async function fetchFriends(): Promise<Friend[]> {
  if (IS_DEMO_MODE) {
    return demoGet<Friend[]>(STORAGE_KEYS.FRIENDS, []);
  }

  const supabase = getSupabase();
  const { data, error } = await supabase.from("friends").select("*");
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as Friend[];
}

export async function sendFriendRequest(
  userId: string,
  message?: string,
): Promise<{ status: "pending" }> {
  if (IS_DEMO_MODE) {
    // In demo mode, simulate pending state
    return { status: "pending" };
  }

  const supabase = getSupabase();

  // Guard: prevent self-friend-requests
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && user.id === userId) {
    throw new ApiError(400, "Bạn không thể tự kết bạn với chính mình.");
  }

  const { error } = await supabase.from("friend_requests").insert({
    to_user_id: userId,
    message: message || null,
    status: "pending",
  });
  if (error) {
    // Handle duplicate constraint gracefully
    if (error.code === "23505") {
      throw new ApiError(409, "Lời mời kết bạn đã được gửi trước đó.");
    }
    throw new ApiError(500, error.message);
  }
  return { status: "pending" };
}

// ─── Search ─────────────────────────────────────────────────────────────────

export async function searchUsers(query: string): Promise<SearchResult | null> {
  if (IS_DEMO_MODE) {
    // Demo: simulate basic search
    const lowerQuery = query.toLowerCase().replace(/\s+/g, "");

    // Check invite codes first
    if (/^\d{10}$/.test(query)) {
      const registry = demoGet<Record<string, InviteCode>>(STORAGE_KEYS.INVITE_CODES, {});
      const invite = registry[query];
      if (invite) {
        if (invite.expires && Date.now() > invite.expires) {
          throw new ApiError(410, "Mã mời này đã hết hạn sử dụng.");
        }
        if (invite.maxUses && invite.uses >= invite.maxUses) {
          throw new ApiError(410, "Mã mời này đã đạt giới hạn số lần sử dụng.");
        }
        return { type: "group", name: invite.groupName, groupId: invite.groupId };
      }
      throw new ApiError(404, "Không tìm thấy nhóm ứng với mã mời này.");
    }

    // Demo mock user search
    if (
      lowerQuery === "@chatify_dev" ||
      lowerQuery === "0999999999" ||
      lowerQuery.includes("dev")
    ) {
      return {
        type: "user",
        id: "demo_chatify_dev",
        name: "Chatify Developer Account",
        username: "@chatify_dev",
        phone: "0999 999 999",
      };
    }

    if (query.startsWith("@") || query.length >= 3) {
      const isPhone = /^[0-9+]+$/.test(query);
      const displayName = isPhone
        ? `Số điện thoại ${query}`
        : query.replace("@", "").charAt(0).toUpperCase() + query.replace("@", "").slice(1);

      return {
        type: "user",
        id: `demo_search_${Date.now()}`,
        name: displayName,
        username: isPhone ? undefined : query.startsWith("@") ? query : `@${query}`,
        phone: isPhone ? query : undefined,
      } as SearchResultUser;
    }

    throw new ApiError(400, "Vui lòng nhập mã mời 10 chữ số, @username hoặc số điện thoại.");
  }

  // Production: search via Supabase
  const supabase = getSupabase();

  // Check invite code via secure RPC
  if (/^\d{10}$/.test(query)) {
    const { data, error: rpcError } = await supabase.rpc("lookup_invite_code", { p_code: query });

    if (rpcError) throw new ApiError(500, rpcError.message);
    const row = Array.isArray(data) ? data[0] : data;

    if (row) {
      if (row.expires_at && new Date() > new Date(row.expires_at)) {
        throw new ApiError(410, "Mã mời này đã hết hạn sử dụng.");
      }
      if (row.max_uses && row.uses >= row.max_uses) {
        throw new ApiError(410, "Mã mời này đã đạt giới hạn số lần sử dụng.");
      }
      return { type: "group", name: row.group_name, groupId: row.group_id };
    }
    throw new ApiError(404, "Không tìm thấy nhóm ứng với mã mời này.");
  }

  // Search by username or phone via secure RPC (doesn't expose phone/email to caller)
  const { data, error } = await supabase.rpc("search_users", { p_query: query.replace("@", "") });

  if (error) throw new ApiError(500, error.message);
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return {
    type: "user",
    id: row.id,
    name: row.name,
    username: row.username ? `@${row.username}` : undefined,
    avatar: row.avatar,
  };
}

// ─── Invite Codes ───────────────────────────────────────────────────────────

export async function generateInviteCode(
  groupId: string,
  groupName: string,
  expiresIn: string,
  maxUses: string,
): Promise<string> {
  if (IS_DEMO_MODE) {
    let code = "";
    for (let i = 0; i < 10; i++) {
      code += Math.floor(Math.random() * 10).toString();
    }

    const registry = demoGet<Record<string, InviteCode>>(STORAGE_KEYS.INVITE_CODES, {});
    registry[code] = {
      code,
      groupId,
      groupName,
      expires:
        expiresIn === "infinite"
          ? null
          : Date.now() +
            (expiresIn === "30m"
              ? 30 * 60 * 1000
              : expiresIn === "1h"
                ? 60 * 60 * 1000
                : 24 * 60 * 60 * 1000),
      maxUses: maxUses === "infinite" ? null : Number(maxUses),
      uses: 0,
    };
    demoSet(STORAGE_KEYS.INVITE_CODES, registry);
    return code;
  }

  const supabase = getSupabase();
  let code = "";
  let retries = 3;
  while (retries > 0) {
    code = crypto.randomUUID().replace(/-/g, "").slice(0, 10);
    const { error } = await supabase.from("invite_codes").insert({
      code,
      group_id: groupId,
      group_name: groupName,
      expires_at:
        expiresIn === "infinite"
          ? null
          : new Date(
              Date.now() +
                (expiresIn === "30m"
                  ? 30 * 60 * 1000
                  : expiresIn === "1h"
                    ? 60 * 60 * 1000
                    : 24 * 60 * 60 * 1000),
            ).toISOString(),
      max_uses: maxUses === "infinite" ? null : Number(maxUses),
      uses: 0,
    });

    if (!error) return code;
    if (error.code === "23505") {
      retries--;
      continue;
    }
    throw new ApiError(500, error.message);
  }
  throw new ApiError(500, "Không thể tạo mã mời độc nhất sau nhiều lần thử.");
}

export async function markMessagesAsRead(convId: string, userId: string): Promise<void> {
  if (IS_DEMO_MODE) return;
  const supabase = getSupabase();

  // Only mark messages not authored by the current user and not already read
  const { data: messages, error } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", convId)
    .neq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error || !messages?.length) return;

  const reads = messages.map((m: { id: string }) => ({
    message_id: m.id,
    user_id: userId,
  }));

  await supabase.from("message_reads").upsert(reads, {
    onConflict: "message_id,user_id",
    ignoreDuplicates: true,
  });
}

export async function updateProfile(userId: string, updates: Partial<Profile>): Promise<void> {
  if (IS_DEMO_MODE) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from("profiles")
    .update({
      name: updates.name,
      username: updates.username,
      avatar: updates.avatar,
      bio: updates.bio,
      cover: updates.cover,
      phone: updates.phone,
    })
    .eq("id", userId);

  if (error) throw new ApiError(500, error.message);
}

export async function joinConversation(convId: string, member: Member): Promise<Conversation> {
  if (IS_DEMO_MODE) {
    const convs = demoGet<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
    const conv = convs.find((c) => c.id === convId);
    if (!conv) throw new ApiError(404, "Không tìm thấy nhóm.");
    if (!conv.members.some((m) => m.id === member.id)) {
      conv.members.push(member);
      demoSet(STORAGE_KEYS.CONVERSATIONS, convs);
    }
    return conv;
  }

  const supabase = getSupabase();
  const { error } = await supabase
    .from("conversation_members")
    .insert({ conversation_id: convId, user_id: member.id, role: "member" });
  if (error) throw new ApiError(500, error.message);

  const { data, error: fetchErr } = await supabase
    .from("conversations")
    .select("*, conversation_members(user_id, role, profiles(name, avatar, username))")
    .eq("id", convId)
    .single();
  if (fetchErr) throw new ApiError(500, fetchErr.message);
  return mapConversationFromDb(data);
}

export async function incrementInviteUsage(code: string): Promise<void> {
  if (IS_DEMO_MODE) {
    const registry = demoGet<Record<string, InviteCode>>(STORAGE_KEYS.INVITE_CODES, {});
    const invite = registry[code];
    if (invite) {
      invite.uses += 1;
      demoSet(STORAGE_KEYS.INVITE_CODES, registry);
    }
    return;
  }

  const supabase = getSupabase();
  const { error } = await supabase.rpc("increment_invite_uses", { invite_code: code });
  if (error) throw new ApiError(500, error.message);
}

export type IncomingFriendRequest = {
  id: string;
  fromUserId: string;
  fromName: string;
  fromAvatar: string;
  message?: string;
  createdAt: string;
};

type RawFriendRequest = {
  id: string;
  from_user_id: string;
  message: string | null;
  created_at: string;
  profiles: { name: string; avatar: string } | null;
};

export async function fetchIncomingFriendRequests(): Promise<IncomingFriendRequest[]> {
  if (IS_DEMO_MODE) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("friend_requests")
    .select(
      "id, from_user_id, message, created_at, profiles!friend_requests_from_user_id_fkey(name, avatar)",
    )
    .eq("status", "pending");
  if (error) throw new ApiError(500, error.message);

  return ((data as unknown as RawFriendRequest[]) ?? []).map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    fromName: r.profiles?.name ?? "Người dùng",
    fromAvatar: r.profiles?.avatar ?? "",
    message: r.message ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function respondToFriendRequest(
  requestId: string,
  action: "accept" | "reject",
): Promise<void> {
  if (IS_DEMO_MODE) return;

  const supabase = getSupabase();
  const { error } = await supabase
    .from("friend_requests")
    .update({ status: action === "accept" ? "accepted" : "rejected" })
    .eq("id", requestId);
  if (error) throw new ApiError(500, error.message);
}

type RawProfile = {
  id: string;
  name: string;
  avatar: string;
  username: string | null;
};

export async function fetchProfilesByIds(ids: string[]): Promise<Member[]> {
  if (ids.length === 0) return [];
  if (IS_DEMO_MODE) return [];

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, avatar, username")
    .in("id", ids);
  if (error) throw new ApiError(500, error.message);
  return ((data as unknown as RawProfile[]) ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    avatar: p.avatar,
    role: "member" as const,
  }));
}
