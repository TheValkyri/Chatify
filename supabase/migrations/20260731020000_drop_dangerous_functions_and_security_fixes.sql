-- ============================================================================
-- Migration: 20260731020000_drop_dangerous_functions_and_security_fixes.sql
-- Description: Critical security fixes from full audit
--   1. DROP dangerous clear_all_app_data() function
--   2. Fix messages.author_id to allow user deletion (ON DELETE SET NULL)
--   3. Restrict friend_requests UPDATE to status column only (via RPC)
--   4. Add membership check to messages_update_own policy
--   5. Add missing performance indexes
--   6. Drop deprecated columns
-- ============================================================================

-- ═══ 1. DROP DANGEROUS clear_all_app_data() ═══
-- This function had SECURITY DEFINER with no auth check.
-- ANY user could call it to wipe the entire database.
DROP FUNCTION IF EXISTS public.clear_all_app_data();

-- ═══ 2. Fix messages.author_id FK for user deletion ═══
-- Currently blocks user deletion because of FK constraint without CASCADE.
ALTER TABLE public.messages DROP CONSTRAINT IF EXISTS messages_author_id_fkey;
ALTER TABLE public.messages ALTER COLUMN author_id DROP NOT NULL;
ALTER TABLE public.messages ADD CONSTRAINT messages_author_id_fkey
  FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- ═══ 3. Restrict friend_requests UPDATE to status column only ═══
-- Previous policy allowed recipient to modify the 'message' column too.
DROP POLICY IF EXISTS "friend_requests_update_recipient" ON public.friend_requests;

-- RPC to safely update friend request status (only status field)
CREATE OR REPLACE FUNCTION public.respond_to_friend_request(
  p_request_id uuid,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Validate status value
  IF p_status NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'Invalid status. Must be accepted or rejected.';
  END IF;

  -- Only the recipient can respond
  UPDATE public.friend_requests
  SET status = p_status
  WHERE id = p_request_id
    AND to_user_id = auth.uid()
    AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or you are not the recipient.';
  END IF;
END;
$$;

-- ═══ 4. Fix messages_update_own — require active membership ═══
DROP POLICY IF EXISTS "messages_update_own" ON public.messages;

CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE
  USING (
    auth.uid() = author_id
    AND EXISTS (
      SELECT 1 FROM public.conversation_members
      WHERE conversation_id = messages.conversation_id
        AND user_id = auth.uid()
    )
  );

-- ═══ 5. Performance Indexes ═══
-- Critical for message loading (WHERE conversation_id = ? ORDER BY created_at)
CREATE INDEX IF NOT EXISTS idx_messages_conv_created
  ON public.messages (conversation_id, created_at DESC);

-- Critical for get_conversations_with_unread (WHERE user_id = ?)
CREATE INDEX IF NOT EXISTS idx_conversation_members_user
  ON public.conversation_members (user_id);

-- Critical for loading pending friend requests
CREATE INDEX IF NOT EXISTS idx_friend_requests_to_user
  ON public.friend_requests (to_user_id) WHERE status = 'pending';

-- Index for unread count subquery
CREATE INDEX IF NOT EXISTS idx_messages_conv_author_created
  ON public.messages (conversation_id, author_id, created_at);

-- ═══ 6. Drop deprecated columns ═══
ALTER TABLE public.conversations DROP COLUMN IF EXISTS unread;
ALTER TABLE public.conversations DROP COLUMN IF EXISTS presence;
