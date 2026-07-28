// ─── Chatify — Conversations React Query Hooks ─────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchConversations,
  createConversation,
  deleteConversation,
  updateConversation,
  updateMemberRole,
  removeMember,
  transferOwnership,
  joinConversation,
} from "@/lib/api";
import type { Conversation, Member } from "@/lib/types";

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const conversationKeys = {
  all: ["conversations"] as const,
  detail: (id: string) => ["conversations", id] as const,
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch all conversations for the current user.
 */
export function useConversations() {
  return useQuery({
    queryKey: conversationKeys.all,
    queryFn: fetchConversations,
    staleTime: 1000 * 2,
    refetchInterval: 3000,
  });
}

/**
 * Create a new conversation (group or DM).
 */
export function useCreateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (conv: Conversation) => createConversation(conv),
    onSuccess: (newConv) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) => {
        if (!old) return [newConv];
        return [...old, newConv];
      });
      if (newConv.isGroup) {
        toast.success("Đã tạo nhóm thành công!");
      } else {
        toast.success("Đã mở cuộc trò chuyện!");
      }
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Không thể tạo cuộc trò chuyện.");
    },
  });
}

/**
 * Delete / leave a conversation.
 */
export function useDeleteConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (convId: string) => deleteConversation(convId),
    onSuccess: (_, convId) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) =>
        old ? old.filter((c) => c.id !== convId) : [],
      );
    },
  });
}

/**
 * Update conversation metadata (name, avatar, description).
 */
export function useUpdateConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ convId, updates }: { convId: string; updates: Partial<Conversation> }) =>
      updateConversation(convId, updates),
    onSuccess: (_, { convId, updates }) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) =>
        old ? old.map((c) => (c.id === convId ? { ...c, ...updates } : c)) : [],
      );
    },
  });
}

/**
 * Update a member's role in a group.
 */
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      convId,
      memberId,
      role,
      actorName,
      targetName,
    }: {
      convId: string;
      memberId: string;
      role: Member["role"];
      actorName?: string;
      targetName?: string;
    }) => updateMemberRole(convId, memberId, role, actorName, targetName),
    onSuccess: (_, { convId, memberId, role }) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) =>
        old
          ? old.map((c) =>
              c.id === convId
                ? {
                    ...c,
                    members: c.members.map((m) => (m.id === memberId ? { ...m, role } : m)),
                  }
                : c,
            )
          : [],
      );
    },
  });
}

/**
 * Remove a member from a group.
 */
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      convId,
      memberId,
      currentUserId,
      actorName,
      targetName,
    }: {
      convId: string;
      memberId: string;
      currentUserId?: string;
      actorName?: string;
      targetName?: string;
    }) => removeMember(convId, memberId, currentUserId, actorName, targetName),
    onSuccess: (_, { convId, memberId, currentUserId }) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) => {
        if (!old) return [];
        if (memberId === currentUserId) {
          return old.filter((c) => c.id !== convId);
        }
        return old.map((c) =>
          c.id === convId ? { ...c, members: c.members.filter((m) => m.id !== memberId) } : c,
        );
      });
    },
  });
}

/**
 * Transfer group ownership and leave.
 */
export function useTransferOwnership() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      convId,
      newOwnerId,
      currentOwnerId,
      currentOwnerName,
      newOwnerName,
    }: {
      convId: string;
      newOwnerId: string;
      currentOwnerId: string;
      currentOwnerName?: string;
      newOwnerName?: string;
    }) => transferOwnership(convId, newOwnerId, currentOwnerId, currentOwnerName, newOwnerName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: conversationKeys.all });
    },
  });
}

/**
 * Join an existing conversation via invite code.
 */
export function useJoinConversation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ convId, member }: { convId: string; member: Member }) =>
      joinConversation(convId, member),
    onSuccess: (updatedConv) => {
      queryClient.setQueryData<Conversation[]>(conversationKeys.all, (old) => {
        if (!old) return [updatedConv];
        if (old.some((c) => c.id === updatedConv.id)) {
          return old.map((c) => (c.id === updatedConv.id ? updatedConv : c));
        }
        return [...old, updatedConv];
      });
    },
  });
}
