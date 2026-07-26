-- ============================================================================
-- Migration: 20260726130000_fix_per_user_unread_and_rpcs.sql
-- Mô tả: Thêm theo dõi thời điểm đọc tin theo cá nhân và các RPC nguyên tử
-- ============================================================================

-- 1. Thêm cột last_read_at vào conversation_members để quản lý unread cá nhân
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
      and table_name = 'conversation_members' 
      and column_name = 'last_read_at'
  ) then
    alter table public.conversation_members add column last_read_at timestamptz not null default now();
  end if;
end $$;

-- 2. RPC Nguyên tử: Tham gia nhóm bằng mã mời với Lock dòng (FOR UPDATE)
create or replace function public.join_via_invite_code(p_code text)
returns text
language plpgsql
security definer
as $$
declare
  v_group_id text;
  v_expires_at timestamptz;
  v_max_uses integer;
  v_uses integer;
begin
  -- Khóa dòng invite_code để tránh TOCTOU race condition
  select group_id, expires_at, max_uses, uses
  into v_group_id, v_expires_at, v_max_uses, v_uses
  from public.invite_codes
  where code = p_code
  for update;

  if v_group_id is null then
    raise exception 'Không tìm thấy nhóm ứng với mã mời này.';
  end if;

  if v_expires_at is not null and now() > v_expires_at then
    raise exception 'Mã mời này đã hết hạn sử dụng.';
  end if;

  if v_max_uses is not null and v_uses >= v_max_uses then
    raise exception 'Mã mời này đã đạt giới hạn số lần sử dụng.';
  end if;

  -- Thêm người dùng vào hội thoại
  insert into public.conversation_members (conversation_id, user_id, role)
  values (v_group_id, auth.uid(), 'member')
  on conflict (conversation_id, user_id) do nothing;

  -- Tăng số lần sử dụng
  update public.invite_codes
  set uses = uses + 1
  where code = p_code;

  return v_group_id;
end;
$$;

-- 3. RPC Nguyên tử: Chuyển quyền Trưởng nhóm (Transfer Ownership)
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
  -- Kiểm tra quyền: chỉ owner hiện tại hoặc admin nhóm mới được chuyển quyền
  if auth.uid() <> p_current_owner_id and not public.is_conversation_admin(p_conv_id) then
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
