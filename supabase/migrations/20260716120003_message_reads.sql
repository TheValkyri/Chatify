-- ─── Message Reads Table ─────────────────────────────────────────────────────

create table public.message_reads (
  message_id text not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- Enable RLS
alter table public.message_reads enable row level security;

-- Policies

create policy "Users can view message reads if they are members of the conversation"
  on public.message_reads for select
  using (
    exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_conversation_member(m.conversation_id)
    )
  );

create policy "Users can mark messages as read if they are members of the conversation"
  on public.message_reads for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_reads.message_id
      and public.is_conversation_member(m.conversation_id)
    )
  );
