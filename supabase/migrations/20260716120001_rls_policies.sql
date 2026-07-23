alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.friend_requests enable row level security;
alter table public.invite_codes enable row level security;

-- Hàm helper — TRÁNH đệ quy khi policy trên conversation_members cần tự kiểm tra conversation_members
create or replace function public.is_conversation_member(conv_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_conversation_admin(conv_id text)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = conv_id and user_id = auth.uid() and role in ('owner','admin')
  );
$$;

-- profiles: đọc công khai cho user đã đăng nhập (cần cho search), chỉ chủ mới sửa
create policy "profiles_select_all" on public.profiles for select using (auth.role() = 'authenticated');
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);

-- conversations
create policy "conversations_select_member" on public.conversations for select using (public.is_conversation_member(id));
create policy "conversations_insert_authenticated" on public.conversations for insert with check (auth.role() = 'authenticated');
create policy "conversations_update_admin" on public.conversations for update using (public.is_conversation_admin(id));

-- conversation_members — dùng hàm helper, KHÔNG query trực tiếp bảng này trong using()
create policy "members_select_own_convs" on public.conversation_members for select using (public.is_conversation_member(conversation_id));
create policy "members_insert_self_or_admin" on public.conversation_members for insert with check (
  user_id = auth.uid() or public.is_conversation_admin(conversation_id)
);
create policy "members_manage_admin" on public.conversation_members for update using (public.is_conversation_admin(conversation_id));
create policy "members_delete_admin_or_self" on public.conversation_members for delete using (
  user_id = auth.uid() or public.is_conversation_admin(conversation_id)
);

-- messages
create policy "messages_select_member" on public.messages for select using (public.is_conversation_member(conversation_id));
create policy "messages_insert_member" on public.messages for insert with check (
  auth.uid() = author_id and public.is_conversation_member(conversation_id)
);

-- friend_requests
create policy "friend_requests_select_own" on public.friend_requests for select using (
  auth.uid() = from_user_id or auth.uid() = to_user_id
);
create policy "friend_requests_insert_own" on public.friend_requests for insert with check (auth.uid() = from_user_id);
create policy "friend_requests_update_recipient" on public.friend_requests for update using (auth.uid() = to_user_id);

-- invite_codes: đọc được nếu biết mã (join flow), chỉ admin nhóm mới tạo
create policy "invite_codes_select_any_authenticated" on public.invite_codes for select using (auth.role() = 'authenticated');
create policy "invite_codes_insert_admin" on public.invite_codes for insert with check (public.is_conversation_admin(group_id));
