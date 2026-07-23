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
export function useRealtimeGlobal(currentUserId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (IS_DEMO_MODE || !currentUserId) return;
    const supabase = getSupabase();

    const channel = supabase
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

          // Also inject into the message cache for that conversation
          // (useRealtimeMessages already does this for the active conv,
          // but this covers background conversations too)
          const incoming = mapMessageFromDb(row);
          queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
            if (!old) return undefined; // don't create cache entries for convs we haven't loaded
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
          // Re-fetch the full conversation list when membership changes
          queryClient.invalidateQueries({ queryKey: conversationKeys.all });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [currentUserId, queryClient]);
}
