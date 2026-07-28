import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { IS_DEMO_MODE } from "@/lib/config";
import { conversationKeys } from "./useConversations";
import { messageKeys } from "./useMessages";
import { mapMessageFromDb } from "@/lib/mappers";
import type { Conversation, Message } from "@/lib/types";

/**
 * Global realtime subscription for sidebar updates.
 * Listens to all new messages across all conversations the user is part of,
 * and to membership changes, so the sidebar stays in sync.
 */
import { toast } from "sonner";

export function useRealtimeGlobal(
  currentUserId: string | null,
  onEvictedFromConv?: (convId: string) => void,
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (IS_DEMO_MODE || !currentUserId) return;
    const supabase = getSupabase();

    // ⚡ INSTANT USER-SPECIFIC BROADCAST CHANNEL (< 30ms)
    const userChannel = supabase
      .channel(`user:${currentUserId}`, {
        config: { broadcast: { self: true } },
      })
      .on(
        "broadcast",
        { event: "user_group_event" },
        (payload: {
          payload: {
            event: string;
            convId: string;
            targetUserId?: string;
            actorName?: string;
            targetName?: string;
            newRole?: string;
          };
        }) => {
          const { event, convId, targetUserId, newRole } = payload.payload;

          if (event === "member_kicked" && targetUserId === currentUserId) {
            // Remove conversation from query cache immediately
            queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) =>
              old ? old.filter((c) => c.id !== convId) : [],
            );
            queryClient.invalidateQueries({ queryKey: conversationKeys.all });

            toast.error("Bạn đã bị xóa khỏi nhóm!");
            if (onEvictedFromConv) {
              onEvictedFromConv(convId);
            }
          } else if (event === "role_updated" || event === "ownership_transferred") {
            queryClient.invalidateQueries({ queryKey: conversationKeys.all });
            if (event === "role_updated" && newRole) {
              const roleTitle = newRole === "admin" ? "Phó nhóm" : "Thành viên";
              toast.info(`Vai trò của bạn trong nhóm đã được cập nhật thành: ${roleTitle}`);
            }
          }
        },
      )
      .subscribe();

    const sidebarChannel = supabase
      .channel("global:sidebar")
      // ── New messages (any conversation) ──
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        (payload: {
          new: {
            id: string;
            conversation_id: string;
            author_id: string;
            text: string | null;
            attachment: unknown;
            created_at: string;
          };
        }) => {
          const row = payload.new;
          const convId = row.conversation_id;

          // Update conversation preview & unread in cache
          queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) => {
            if (!old) return old;
            return old.map((c) => {
              if (c.id !== convId) return c;
              const preview = row.text || (row.attachment ? "[Tệp đính kèm]" : "");
              const isFromMe = row.author_id === currentUserId;
              return {
                ...c,
                preview,
                time: new Date(row.created_at).toLocaleTimeString("vi-VN", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
                unread: isFromMe ? c.unread : c.unread + 1,
              };
            });
          });

          const incoming = mapMessageFromDb(row);
          queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
            if (!old) return undefined;
            if (old.some((m) => m.id === incoming.id)) return old;
            return [...old, incoming];
          });
        },
      )
      // ── Membership changes ──
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: conversationKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(userChannel);
      supabase.removeChannel(sidebarChannel);
    };
  }, [currentUserId, queryClient, onEvictedFromConv]);
}
