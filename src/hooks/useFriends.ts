// ─── Chatify — Friends React Query Hooks ────────────────────────────────────

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  fetchFriends,
  fetchIncomingFriendRequests,
  respondToFriendRequest,
} from "@/lib/api";

// ─── Query Keys ─────────────────────────────────────────────────────────────

export const friendKeys = {
  all: ["friends"] as const,
  requests: ["friend-requests"] as const,
};

// ─── Hooks ──────────────────────────────────────────────────────────────────

/**
 * Fetch the authenticated user's friend list.
 */
export function useFriends() {
  return useQuery({
    queryKey: friendKeys.all,
    queryFn: fetchFriends,
    staleTime: 1000 * 60, // 1 minute
  });
}

/**
 * Fetch pending incoming friend requests.
 */
export function useFriendRequests() {
  return useQuery({
    queryKey: friendKeys.requests,
    queryFn: fetchIncomingFriendRequests,
    staleTime: 1000 * 30, // 30s
  });
}

/**
 * Accept or reject a friend request.
 */
export function useRespondToFriendRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ requestId, action }: { requestId: string; action: "accept" | "reject" }) =>
      respondToFriendRequest(requestId, action),
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: friendKeys.requests });
      queryClient.invalidateQueries({ queryKey: friendKeys.all });
      toast.success(action === "accept" ? "Đã chấp nhận lời mời!" : "Đã từ chối lời mời.");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Không thể xử lý lời mời kết bạn.");
    },
  });
}
