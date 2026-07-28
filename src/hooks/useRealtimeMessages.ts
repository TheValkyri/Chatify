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
      .channel(`messages:${convId}`)
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
            const incoming = mapMessageFromDb(payload.new);
            queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
              if (!old) return [incoming];
              if (old.some((m) => m.id === incoming.id)) return old; // tránh trùng với optimistic update của chính mình
              return [...old, incoming];
            });
          } else if (payload.eventType === "UPDATE") {
            const incoming = mapMessageFromDb(payload.new);
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
