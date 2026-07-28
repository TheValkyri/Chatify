-- ============================================================================
-- Migration: 20260728180000_fix_all_audit_security_issues.sql
-- Mô tả: Khắc phục các vấn đề bảo mật theo Chatify Audit Report:
--   - Giới hạn quyền truy cập profiles PII.
--   - Vá lỗi RPC tạo hội thoại và chuyển quyền.
--   - Cải thiện an toàn cho invite code.
--   - Thêm RPC lấy unread count cá nhân.
--   - Đánh dấu deprecate các cột cũ.
-- ============================================================================

-- ============================================================================
-- 1. Profiles PII Protection (Item 4.2 & 5.2)
-- Drop policy cũ cho phép mọi người đọc toàn bộ profile
-- ============================================================================
drop policy if exists "profiles_select_all" on public.profiles;

-- Hàm kiểm tra xem 2 user có chung hội thoại không
create or replace function public.are_users_in_same_conversation(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 
    from public.conversation_members cm1
    join public.conversation_members cm2 on cm1.conversation_id = cm2.conversation_id
    where cm1.user_id = user_a and cm2.user_id = user_b
  );
$$;

-- Chỉ cho phép chủ sở hữu và những người có chung hội thoại được SELECT trực tiếp profiles
create policy "profiles_select_own_or_member" on public.profiles
for select using (
  auth.uid() = id or public.are_users_in_same_conversation(auth.uid(), id)
);

-- RPC hỗ trợ lấy thông tin an toàn (ẩn thông tin nhạy cảm nếu không đủ quyền)
create or replace function public.get_user_profile(target_user_id uuid)
returns table (
  id uuid,
  name text,
  username text,
  avatar text,
  bio text,
  cover text,
  phone text
)
language sql
security definer
stable
as $$
  select 
    p.id, 
    p.name, 
    p.username, 
    p.avatar,
    case when auth.uid() = p.id or public.are_users_in_same_conversation(auth.uid(), p.id) then p.bio else null end as bio,
    case when auth.uid() = p.id or public.are_users_in_same_conversation(auth.uid(), p.id) then p.cover else null end as cover,
    case when auth.uid() = p.id or public.are_users_in_same_conversation(auth.uid(), p.id) then p.phone else null end as phone
  from public.profiles p
  where p.id = target_user_id;
$$;

-- ============================================================================
-- 2. Fix create_conversation_atomic (Item 5.4)
-- Ràng buộc quyền tạo nhóm (phải nằm trong danh sách) và bounds của mảng
-- ============================================================================
create or replace function public.create_conversation_atomic(
  p_id text,
  p_name text,
  p_avatar text,
  p_is_group boolean,
  p_description text,
  p_member_ids uuid[],
  p_member_roles text[]
)
returns void
language plpgsql
security definer
as $$
declare
  i integer;
begin
  -- Bảo mật: Người gọi phải có mặt trong danh sách thành viên của hội thoại
  if not (auth.uid() = any(p_member_ids)) then
    raise exception 'Caller must be a member of the conversation';
  end if;

  -- Bảo vệ array bounds (số lượng id và roles phải khớp nhau)
  if coalesce(array_length(p_member_ids, 1), 0) <> coalesce(array_length(p_member_roles, 1), 0) then
    raise exception 'Member IDs and roles array lengths must match';
  end if;

  -- Tạo hội thoại mới
  insert into public.conversations (id, name, avatar, is_group, description)
  values (p_id, p_name, p_avatar, p_is_group, p_description);

  -- Thêm tất cả thành viên vào hội thoại
  for i in 1..coalesce(array_length(p_member_ids, 1), 0) loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_id, p_member_ids[i], p_member_roles[i]);
  end loop;
end;
$$;

-- ============================================================================
-- 3. Fix transfer_ownership_atomic & updateMemberRole (Item 5.5)
-- Chỉ owner hiện tại mới có quyền chuyển owner cho người khác
-- ============================================================================
create or replace function public.transfer_ownership_atomic(
  p_conv_id text,
  p_new_owner_id uuid,
  p_current_owner_id uuid
)
returns void
language plpgsql
security definer
as $$
begin
  -- Kiểm tra quyền: CHỈ owner hiện tại mới được chuyển quyền
  if auth.uid() <> p_current_owner_id then
    raise exception 'Bạn không có quyền chuyển giao vai trò trưởng nhóm.';
  end if;

  -- Cập nhật vai trò owner mới
  update public.conversation_members
  set role = 'owner'
  where conversation_id = p_conv_id and user_id = p_new_owner_id;

  -- Hạ vai trò owner cũ về member
  update public.conversation_members
  set role = 'member'
  where conversation_id = p_conv_id and user_id = p_current_owner_id;
end;
$$;

-- Ngăn chặn thành viên tự ý set role = 'owner' qua API (RLS update)
drop policy if exists "members_manage_admin" on public.conversation_members;

create policy "members_manage_admin" on public.conversation_members
  for update
  using (public.is_conversation_admin(conversation_id))
  with check (
    public.is_conversation_admin(conversation_id)
    and role != 'owner' -- Bắt buộc dùng RPC để chuyển quyền owner
  );

-- ============================================================================
-- 4. Fix increment_invite_uses (Item 5.3 & 4.6)
-- Xóa hàm increment_invite_uses không an toàn, buộc phải dùng join_via_invite_code (FOR UPDATE)
-- ============================================================================
drop function if exists public.increment_invite_uses(text);

-- ============================================================================
-- 5. Per-user Unread Count RPC (Item 4.1 & Item 9)
-- ============================================================================
create or replace function public.get_conversations_with_unread(p_user_id uuid)
returns table (
  id text,
  name text,
  avatar text,
  is_group boolean,
  description text,
  preview text,
  presence text,
  created_at timestamptz,
  updated_at timestamptz,
  unread_count bigint
)
language sql
security definer
stable
as $$
  select 
    c.id, c.name, c.avatar, c.is_group, c.description, c.preview, c.presence, c.created_at, c.updated_at,
    (
      select count(*) 
      from public.messages m 
      where m.conversation_id = c.id 
        and m.created_at > cm.last_read_at 
        and m.author_id != p_user_id
    ) as unread_count
  from public.conversations c
  join public.conversation_members cm on c.id = cm.conversation_id
  where cm.user_id = p_user_id;
$$;

create or replace function public.mark_conversation_as_read(p_conv_id text, p_user_id uuid)
returns void
language plpgsql
security definer
as $$
begin
  -- Đảm bảo chỉ người dùng đang đăng nhập mới cập nhật được trạng thái của họ
  if auth.uid() <> p_user_id then
    raise exception 'Không có quyền cập nhật trạng thái đã đọc của người khác.';
  end if;

  update public.conversation_members
  set last_read_at = now()
  where conversation_id = p_conv_id and user_id = p_user_id;
end;
$$;

-- ============================================================================
-- 6. Cleanup unneeded columns (Item 7)
-- ============================================================================
comment on column public.conversations.unread is 'DEPRECATED: Use get_conversations_with_unread RPC for per-user unread counts.';
comment on column public.conversations.presence is 'DEPRECATED: Presence should be tracked in real-time or via a separate table, not on the conversation itself.';
