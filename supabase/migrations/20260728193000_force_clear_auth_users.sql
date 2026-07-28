-- ============================================================================
-- Migration: 20260728193000_force_clear_auth_users.sql
-- Mô tả: Xóa triệt để auth.identities, auth.sessions, auth.users và ứng dụng
-- ============================================================================

create or replace function public.clear_all_app_data()
returns void
language plpgsql
security definer
set search_path = public, auth, storage
as $$
begin
  -- 1. Xóa toàn bộ dữ liệu bảng public
  truncate table public.message_reads cascade;
  truncate table public.messages cascade;
  truncate table public.conversation_members cascade;
  truncate table public.conversations cascade;
  truncate table public.friend_requests cascade;
  truncate table public.invite_codes cascade;
  
  delete from public.profiles;

  -- 2. Xóa triệt để auth tables theo thứ tự ràng buộc khóa ngoại (FK)
  delete from auth.mfa_amr_claims;
  delete from auth.mfa_challenges;
  delete from auth.mfa_factors;
  delete from auth.refresh_tokens;
  delete from auth.sessions;
  delete from auth.identities;
  delete from auth.one_time_tokens;
  delete from auth.users;
end;
$$;

-- Thực thi ngay lập tức
select public.clear_all_app_data();
