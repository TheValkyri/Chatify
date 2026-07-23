create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql security definer
as $$
begin
  update public.conversations
  set
    preview = coalesce(
      left(new.text, 120),
      case when new.attachment is not null then '[' || (new.attachment->>'kind') || ']' else '' end
    ),
    updated_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row execute function public.touch_conversation_on_message();
