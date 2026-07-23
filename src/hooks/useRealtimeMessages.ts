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
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${convId}`,
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
          const incoming = mapMessageFromDb(payload.new);
          queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => {
            if (!old) return [incoming];
            if (old.some((m) => m.id === incoming.id)) return old; // tránh trùng với optimistic update của chính mình
            return [...old, incoming];
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [convId, queryClient]);
}
