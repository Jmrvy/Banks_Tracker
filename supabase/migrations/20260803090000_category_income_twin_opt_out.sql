-- Per-category control over whether a spending category carries an income
-- twin. Automatic pairing is the right default -- most refunds and
-- reimbursements belong against the budget they came out of -- but not every
-- category has an income side worth netting. "Investissement" is the case in
-- point: its income rows are savings withdrawals, and netting thousands of
-- euros of Livret A movements against a 600 EUR budget would be nonsense.

alter table public.categories
  add column if not exists wants_income_twin boolean not null default true;

comment on column public.categories.wants_income_twin is
  'Spending categories only: whether an income twin is kept in step with this category. Always false on income rows.';

-- The flag has no meaning on the income side, and leaving a stray true there
-- invites a future query to read it without filtering on kind.
create or replace function public.normalise_twin_flag()
returns trigger
language plpgsql
as $function$
begin
  if new.kind <> 'expense' then
    new.wants_income_twin := false;
  end if;
  return new;
end;
$function$;

drop trigger if exists categories_normalise_twin_flag on public.categories;
create trigger categories_normalise_twin_flag
  before insert or update on public.categories
  for each row execute function public.normalise_twin_flag();

update public.categories set wants_income_twin = false where kind = 'income';

alter table public.categories
  drop constraint if exists categories_twin_flag_expense_only;
alter table public.categories
  add constraint categories_twin_flag_expense_only
  check (kind = 'expense' or not wants_income_twin);

-- Seed the flag from what is actually there rather than from the default, so
-- the toggle opens showing the truth. A spending category with no twin today
-- reads as off, and turning it on becomes a deliberate act.
update public.categories c
   set wants_income_twin = false
 where c.kind = 'expense'
   and not exists (
     select 1 from public.categories x
      where x.offsets_category_id = c.id and x.kind = 'income'
   );

create or replace function public.sync_income_twin()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  twin_id uuid;
  filed integer;
begin
  -- Only spending categories have twins, and a twin never spawns its own.
  if new.kind <> 'expense' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.wants_income_twin then
      -- on conflict: the owner may already have an income category of this
      -- name, in which case theirs stands and nothing is overwritten.
      insert into public.categories (user_id, name, color, icon, kind, offsets_category_id)
      values (new.user_id, new.name, new.color, new.icon, 'income', new.id)
      on conflict (user_id, name, kind) do nothing;
    end if;
    return new;
  end if;

  select id into twin_id
    from public.categories
   where offsets_category_id = new.id and kind = 'income'
   limit 1;

  if not new.wants_income_twin then
    if twin_id is not null then
      select count(*) into filed from (
        select 1 from public.transactions where category_id = twin_id
        union all
        select 1 from public.transaction_categories where category_id = twin_id
      ) s;

      if filed = 0 then
        delete from public.categories where id = twin_id;
      else
        -- transactions.category_id is ON DELETE SET NULL, so deleting here
        -- would quietly strand real income as uncategorised. The category
        -- survives as a standalone income category and merely stops netting
        -- the budget.
        update public.categories set offsets_category_id = null where id = twin_id;
      end if;
    end if;
    return new;
  end if;

  if twin_id is null then
    -- Re-adopt a standalone income category of the same name instead of
    -- colliding with the unique index, so off-and-on again is lossless.
    update public.categories
       set offsets_category_id = new.id
     where user_id = new.user_id
       and kind = 'income'
       and name = new.name
       and offsets_category_id is null
    returning id into twin_id;

    if twin_id is null then
      insert into public.categories (user_id, name, color, icon, kind, offsets_category_id)
      values (new.user_id, new.name, new.color, new.icon, 'income', new.id)
      on conflict (user_id, name, kind) do nothing;
    end if;

    return new;
  end if;

  -- Keep the twin recognisable as the same category.
  if new.name is distinct from old.name
     or new.color is distinct from old.color
     or new.icon is distinct from old.icon then
    update public.categories
       set name = new.name, color = new.color, icon = new.icon
     where id = twin_id
       -- Skip if renaming would collide with another of theirs.
       and not exists (
         select 1 from public.categories x
          where x.user_id = new.user_id and x.kind = 'income'
            and x.name = new.name and x.id <> twin_id
       );
  end if;

  return new;
end;
$function$;

drop trigger if exists categories_income_twin on public.categories;
create trigger categories_income_twin
  after insert or update of name, color, icon, kind, wants_income_twin
  on public.categories
  for each row execute function public.sync_income_twin();
