-- ============================================================================
-- Migration: 20260728190000_clear_all_app_data.sql
-- Mô tả: Xóa sạch toàn bộ thông tin người dùng, tin nhắn, hội thoại, file đính kèm
-- ============================================================================

-- 1. Hàm RPC cho phép kích hoạt xóa sạch dữ liệu
create or replace function public.clear_all_app_data()
returns void
language plpgsql
security definer
as $$
begin
  -- Xóa bảng đọc tin nhắn
  truncate table public.message_reads cascade;
  
  -- Xóa tin nhắn
  truncate table public.messages cascade;
  
  -- Xóa thành viên hội thoại & hội thoại
  truncate table public.conversation_members cascade;
  truncate table public.conversations cascade;
  
  -- Xóa lời mời kết bạn & mã mời nhóm
  truncate table public.friend_requests cascade;
  truncate table public.invite_codes cascade;
  
  -- Xóa hồ sơ người dùng
  delete from public.profiles;
  
  -- Xóa người dùng trong auth.users
  delete from auth.users;
  
  -- Xóa file đính kèm, avatar, cover trong storage
  delete from storage.objects where bucket_id in ('attachments', 'avatars', 'covers');
end;
$$;

-- Kích hoạt hàm ngay khi migration chạy
select public.clear_all_app_data();
