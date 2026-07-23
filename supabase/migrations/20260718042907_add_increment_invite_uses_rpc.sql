-- ─── Add RPC Function for Atomic Invite Increment ──────────────────────────────

create or replace function public.increment_invite_uses(invite_code text)
returns void
language plpgsql
security definer
as $$
begin
  update public.invite_codes
  set uses = uses + 1
  where code = invite_code;
end;
$$;
