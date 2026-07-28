import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/lib/supabase";
import { IS_DEMO_MODE } from "@/lib/config";
import { messageKeys } from "./useMessages";
import { mapMessageFromDb } from "@/lib/mappers";
import type { Message } from "@/lib/types";

export function useRealtimeMessages(convId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (IS_DEMO_MODE || !convId) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`room:${convId}`, {
        config: { broadcast: { self: true } },
      })

      // ⚡ INSTANT WEBSOCKET BROADCAST LISTENER (< 30ms)
      .on(
        "broadcast",
        { event: "new_message" },
        (payload: { payload: { convId: string; message: Message } }) => {
          const incoming = payload.payload?.message;
          if (!incoming || !incoming.id) return;

          queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
            if (!old) return [incoming];
            if (old.some((m) => m.id === incoming.id)) return old;
            return [...old, incoming];
          });
        },
      )

      // ⚡ INSTANT GROUP EVENT SYSTEM MESSAGES BROADCAST (< 30ms)
      .on(
        "broadcast",
        { event: "group_event" },
        (payload: { payload: { event: string; systemMessage?: Message } }) => {
          const sysMsg = payload.payload?.systemMessage;
          if (sysMsg && sysMsg.id) {
            queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
              if (!old) return [sysMsg];
              if (old.some((m) => m.id === sysMsg.id)) return old;
              return [...old, sysMsg];
            });
          }
        },
      )

      // 🔄 POSTGRES REPLICATION FALLBACK
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
        },
        (payload: { eventType: string; new: Record<string, unknown> }) => {
          if (payload.eventType === "INSERT") {
            const incoming = mapMessageFromDb(
              payload.new as unknown as Parameters<typeof mapMessageFromDb>[0],
            );
            queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
              if (!old) return [incoming];
              if (old.some((m) => m.id === incoming.id)) return old;
              return [...old, incoming];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = mapMessageFromDb(
              payload.new as unknown as Parameters<typeof mapMessageFromDb>[0],
            );
            queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
              if (!old) return old;
              return old.map((m) => (m.id === incoming.id ? { ...m, ...incoming } : m));
            });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convId, queryClient]);
}
