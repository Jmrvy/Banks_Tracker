-- An income category may declare which expense category it offsets.
--
-- Chosen rather than inferred. The savings page used to find its categories
-- by matching names and that failed both ways — a category called Épargne
-- was invisible while anything containing "investment" was swept in — so
-- pairing is an explicit pointer here, and renaming either side keeps it.

alter table public.categories
  add column if not exists offsets_category_id uuid
  references public.categories(id) on delete set null;

alter table public.categories
  drop constraint if exists categories_only_income_offsets;
alter table public.categories
  add constraint categories_only_income_offsets
  check (kind = 'income' or offsets_category_id is null);

alter table public.categories
  drop constraint if exists categories_offset_not_self;
alter table public.categories
  add constraint categories_offset_not_self
  check (offsets_category_id is null or offsets_category_id <> id);

create or replace function public.enforce_offset_target()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
  v_owner uuid;
begin
  if new.offsets_category_id is null then
    return new;
  end if;

  select kind, user_id into v_kind, v_owner
    from public.categories where id = new.offsets_category_id;

  if v_kind is null then
    raise exception 'The offset category does not exist.' using errcode = 'check_violation';
  end if;
  if v_kind <> 'expense' then
    raise exception 'An income category can only offset a spending category.' using errcode = 'check_violation';
  end if;
  if v_owner <> new.user_id then
    raise exception 'A category can only offset one of your own.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists categories_offset_target on public.categories;
create trigger categories_offset_target
  before insert or update of offsets_category_id, kind
  on public.categories
  for each row
  execute function public.enforce_offset_target();

create index if not exists categories_offsets_idx
  on public.categories (offsets_category_id)
  where offsets_category_id is not null;

comment on column public.categories.offsets_category_id is
  'Income category only: the expense category this income is netted against in budgets and reports.';
