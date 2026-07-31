import { getSupabaseSafe } from "./supabase";
import type { Message, Member } from "./types";

/**
 * High-performance WebSocket Realtime Broadcaster for Chatify.
 * Sends instant broadcast events (< 30ms) directly over Supabase Realtime WebSockets,
 * bypassing slow DB WAL logical replication queues.
 */

// Global channel cache for reusing active WebSocket channels
const channelCache = new Map<
  string,
  ReturnType<NonNullable<ReturnType<typeof getSupabaseSafe>>["channel"]>
>();

function getOrJoinChannel(channelName: string) {
  const supabase = getSupabaseSafe();
  if (!supabase) return null;

  if (channelCache.has(channelName)) {
    return channelCache.get(channelName)!;
  }

  const channel = supabase.channel(channelName, {
    config: { broadcast: { self: true } },
  });

  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") {
      // Channel ready for ultra-fast broadcasting
    }
  });

  channelCache.set(channelName, channel);
  return channel;
}

/**
 * Broadcasts a new message instantly to all active members in a conversation.
 */
export async function broadcastNewMessage(convId: string, message: Message) {
  const channel = getOrJoinChannel(`room:${convId}`);
  if (!channel) return;

  await channel.send({
    type: "broadcast",
    event: "new_message",
    payload: { convId, message },
  });
}

/**
 * Broadcasts a group membership / role event to all active members in a conversation.
 */
export async function broadcastGroupEvent(
  convId: string,
  event:
    | "member_kicked"
    | "role_updated"
    | "ownership_transferred"
    | "member_joined"
    | "member_left",
  payload: {
    convId: string;
    targetUserId?: string;
    actorUserId?: string;
    actorName?: string;
    targetName?: string;
    newRole?: Member["role"];
    systemMessage?: Message;
  },
) {
  const channel = getOrJoinChannel(`room:${convId}`);
  if (channel) {
    await channel.send({
      type: "broadcast",
      event: "group_event",
      payload: { event, ...payload },
    });
  }

  // Also send to user-specific channel if targetUserId exists
  if (payload.targetUserId) {
    const userChannel = getOrJoinChannel(`user:${payload.targetUserId}`);
    if (userChannel) {
      await userChannel.send({
        type: "broadcast",
        event: "user_group_event",
        payload: { event, ...payload },
      });
    }
  }
}

/**
 * Leave and clean up a specific broadcast channel.
 * Call when user navigates away from a conversation.
 */
export function leaveChannel(channelName: string) {
  const channel = channelCache.get(channelName);
  if (channel) {
    const supabase = getSupabaseSafe();
    if (supabase) {
      supabase.removeChannel(channel);
    }
    channelCache.delete(channelName);
  }
}

/**
 * Leave and clean up ALL broadcast channels.
 * Call on logout or app unmount.
 */
export function leaveAllChannels() {
  const supabase = getSupabaseSafe();
  if (supabase) {
    for (const channel of channelCache.values()) {
      supabase.removeChannel(channel);
    }
  }
  channelCache.clear();
}
