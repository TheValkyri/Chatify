-- ═══ PROFILES ═══
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  username text unique not null,
  phone text,
  avatar text default '',
  bio text,
  cover text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
as $$
begin
  insert into public.profiles (id, name, username, avatar)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1) || '_' || substr(new.id::text, 1, 4)),
    coalesce(new.raw_user_meta_data->>'avatar', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ═══ CONVERSATIONS ═══
create table public.conversations (
  id text primary key,                 -- giữ dạng text để tương thích id client hiện có (c_xxx / g_xxx)
  name text not null,
  avatar text default '',
  description text,
  is_group boolean not null default false,
  preview text default '',
  unread integer not null default 0,
  presence text default 'offline',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ═══ CONVERSATION_MEMBERS ═══
create table public.conversation_members (
  conversation_id text not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

-- ═══ MESSAGES ═══
create table public.messages (
  id text primary key,
  conversation_id text not null references public.conversations(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  text text,
  attachment jsonb,
  created_at timestamptz not null default now()
);

-- ═══ FRIEND REQUESTS ═══
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references public.profiles(id) default auth.uid(),
  to_user_id uuid not null references public.profiles(id),
  message text,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique (from_user_id, to_user_id)
);

create view public.friends as
select
  p.id, p.name, p.avatar, p.username,
  fr.id as friend_request_id
from public.friend_requests fr
join public.profiles p
  on p.id = (case when fr.from_user_id = auth.uid() then fr.to_user_id else fr.from_user_id end)
where fr.status = 'accepted'
  and (fr.from_user_id = auth.uid() or fr.to_user_id = auth.uid());

-- ═══ INVITE CODES ═══
create table public.invite_codes (
  code text primary key,
  group_id text not null references public.conversations(id) on delete cascade,
  group_name text not null,
  created_by uuid references public.profiles(id) default auth.uid(),
  expires_at timestamptz,
  max_uses integer,
  uses integer not null default 0,
  created_at timestamptz not null default now()
);
