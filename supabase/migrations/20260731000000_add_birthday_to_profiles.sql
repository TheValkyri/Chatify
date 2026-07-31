-- Migration: 20260731000000_add_birthday_to_profiles.sql
-- Description: Add birthday column to profiles table and update get_user_profile RPC

alter table public.profiles
add column if not exists birthday date;

create or replace function public.get_user_profile(target_user_id uuid)
returns table (
  id uuid,
  name text,
  username text,
  avatar text,
  bio text,
  cover text,
  phone text,
  birthday date
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
    case when auth.uid() = p.id or public.are_users_in_same_conversation(auth.uid(), p.id) then p.phone else null end as phone,
    case when auth.uid() = p.id or public.are_users_in_same_conversation(auth.uid(), p.id) then p.birthday else null end as birthday
  from public.profiles p
  where p.id = target_user_id;
$$;
