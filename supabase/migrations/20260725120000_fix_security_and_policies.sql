-- ============================================================================
-- Migration: 20260725120000_fix_security_and_policies.sql
-- Mô tả: Sửa lỗi bảo mật và thêm các policy/RPC còn thiếu
-- ============================================================================

-- ============================================================================
-- 1. Thêm policy UPDATE cho bảng messages
--    Cho phép tác giả cập nhật tin nhắn của chính mình
--    (cần thiết để cập nhật URL đính kèm sau khi upload)
-- ============================================================================
create policy "messages_update_own" on public.messages
  for update using (auth.uid() = author_id)
  with check (auth.uid() = author_id);

-- ============================================================================
-- 2. Thêm policy DELETE cho bảng conversations
--    - Hội thoại 1-1 (DM): thành viên có thể xoá
--    - Nhóm (group): chỉ owner mới được xoá
-- ============================================================================
create policy "conversations_delete_member" on public.conversations
  for delete using (
    case
      when is_group = false then public.is_conversation_member(id)
      else exists (
        select 1 from public.conversation_members
        where conversation_id = id
          and user_id = auth.uid()
          and role = 'owner'
      )
    end
  );

-- ============================================================================
-- 3. Sửa bảo mật invite_codes
--    - Xoá policy SELECT quá rộng (cho phép mọi người xem tất cả mã mời)
--    - Tạo RPC bảo mật để tra cứu mã mời theo đúng mã
--    - Thêm policy SELECT hạn chế: chỉ admin nhóm mới xem được mã mời
-- ============================================================================

-- Xoá policy cũ cho phép tất cả authenticated user đọc mọi invite code
drop policy if exists "invite_codes_select_any_authenticated" on public.invite_codes;

-- RPC bảo mật: tra cứu mã mời theo mã chính xác, không lộ toàn bộ bảng
create or replace function public.lookup_invite_code(p_code text)
returns table (
  code text,
  group_id text,
  group_name text,
  expires_at timestamptz,
  max_uses integer,
  uses integer
)
language sql
security definer
stable
as $$
  select ic.code, ic.group_id, ic.group_name, ic.expires_at, ic.max_uses, ic.uses
  from public.invite_codes ic
  where ic.code = p_code;
$$;

-- Policy mới: chỉ admin của nhóm mới xem được mã mời của nhóm đó
create policy "invite_codes_select_own_group" on public.invite_codes
  for select using (public.is_conversation_admin(group_id));

-- ============================================================================
-- 4. Hạn chế lộ thông tin nhạy cảm trong bảng profiles
--    Vì Postgres RLS không hỗ trợ giới hạn theo cột, ta tạo RPC bảo mật
--    để tìm kiếm user chỉ trả về các trường công khai (id, name, username, avatar)
--    Policy profiles_select_all giữ nguyên vì cần cho việc resolve thành viên hội thoại
-- ============================================================================
create or replace function public.search_users(p_query text)
returns table (
  id uuid,
  name text,
  username text,
  avatar text
)
language sql
security definer
stable
as $$
  select p.id, p.name, p.username, p.avatar
  from public.profiles p
  where p.username ilike '%' || p_query || '%'
     or p.phone = p_query
  limit 5;
$$;

-- ============================================================================
-- 5. RPC tạo hội thoại nguyên tử (atomic)
--    Tạo conversation + thêm tất cả thành viên trong một transaction duy nhất
--    Tránh trường hợp tạo conversation thành công nhưng thêm thành viên thất bại
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
  -- Tạo hội thoại mới
  insert into public.conversations (id, name, avatar, is_group, description)
  values (p_id, p_name, p_avatar, p_is_group, p_description);

  -- Thêm tất cả thành viên vào hội thoại
  for i in 1..array_length(p_member_ids, 1) loop
    insert into public.conversation_members (conversation_id, user_id, role)
    values (p_id, p_member_ids[i], p_member_roles[i]);
  end loop;
end;
$$;
