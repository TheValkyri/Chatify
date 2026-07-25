// ─── Chatify — Messages React Query Hooks ───────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchMessages, sendMessage as apiSendMessage } from "@/lib/api";
import type { Message } from "@/lib/types";

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const messageKeys = {
  all: (convId: string) => ["messages", convId] as const,
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch messages for a conversation.
 * Supports pagination via cursor.
 */
export function useMessages(convId: string | null) {
  return useQuery({
    queryKey: messageKeys.all(convId ?? ""),
    queryFn: () => fetchMessages(convId!),
    enabled: !!convId,
    staleTime: 1000 * 10, // 10s
  });
}

/**
 * Send a message with optimistic update.
 * The message appears instantly in the UI, then syncs with the server.
 */
export function useSendMessage(convId: string | null) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (msg: Message) => {
      if (!convId) throw new Error("No conversation selected");
      return apiSendMessage(convId, msg);
    },

    // Optimistic update: add message immediately
    onMutate: async (msg) => {
      if (!convId) return;

      await queryClient.cancelQueries({ queryKey: messageKeys.all(convId) });

      const previousMessages = queryClient.getQueryData<Message[]>(messageKeys.all(convId));

      queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) => [
        ...(old ?? []),
        { ...msg, status: "sending" },
      ]);

      return { previousMessages };
    },

    // On success: update status to "sent"
    onSuccess: (result, msg) => {
      if (!convId) return;

      queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) =>
        (old ?? []).map((m) => (m.id === msg.id ? { ...m, ...result, status: "sent" } : m)),
      );
    },

    // On error: rollback to previous state
    onError: (_, msg, context) => {
      if (!convId || !context) return;

      if (context.previousMessages) {
        queryClient.setQueryData(messageKeys.all(convId), context.previousMessages);
      } else {
        // Mark the failed message
        queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) =>
          (old ?? []).map((m) => (m.id === msg.id ? { ...m, status: "failed" } : m)),
        );
      }
    },
  });
}

/**
 * Hook to update a specific message in cache AND persist attachment to DB.
 */
export function useUpdateMessage(convId: string) {
  const queryClient = useQueryClient();
  return (messageId: string, patch: Partial<Message>) => {
    // Always update local cache immediately
    queryClient.setQueryData<Message[]>(messageKeys.all(convId), (old) =>
      old?.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
    );

    // If the patch contains a final attachment with a non-blob URL, persist to DB
    if (
      patch.attachment &&
      patch.status === "sent" &&
      patch.attachment.url &&
      !patch.attachment.url.startsWith("blob:")
    ) {
      import("@/lib/config").then(({ IS_DEMO_MODE }) => {
        if (IS_DEMO_MODE) return;
        import("@/lib/supabase").then(({ getSupabase }) => {
          const supabase = getSupabase();
          supabase
            .from("messages")
            .update({ attachment: patch.attachment })
            .eq("id", messageId)
            .then(({ error }) => {
              if (error) console.error("Failed to persist attachment to DB:", error.message);
            });
        });
      });
    }
  };
}
