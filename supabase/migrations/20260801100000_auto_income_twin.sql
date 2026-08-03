-- Every spending category gets an income counterpart, automatically.
--
-- Money can come back on any category, so the pairing is not a decision
-- worth asking about — it is what the model implies. Doing it in the
-- database rather than in one form means it holds however a category is
-- created: onboarding, the modal, an import, a copilot proposal.
--
-- Income categories that stand alone (Salaire, Gains) are still created by
-- hand and offset nothing.

alter table public.categories
  drop constraint if exists categories_offsets_category_id_fkey;
alter table public.categories
  add constraint categories_offsets_category_id_fkey
  foreign key (offsets_category_id) references public.categories(id) on delete cascade;

create or replace function public.sync_income_twin()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.kind <> 'expense' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.categories (user_id, name, color, icon, kind, offsets_category_id)
    values (new.user_id, new.name, new.color, new.icon, 'income', new.id)
    on conflict (user_id, name, kind) do nothing;
    return new;
  end if;

  if new.name is distinct from old.name
     or new.color is distinct from old.color
     or new.icon is distinct from old.icon then
    update public.categories
       set name = new.name, color = new.color, icon = new.icon
     where offsets_category_id = new.id
       and kind = 'income'
       and not exists (
         select 1 from public.categories x
          where x.user_id = new.user_id and x.kind = 'income'
            and x.name = new.name and x.id <> categories.id
       );
  end if;

  return new;
end;
$$;

drop trigger if exists categories_income_twin on public.categories;
create trigger categories_income_twin
  after insert or update of name, color, icon, kind
  on public.categories
  for each row
  execute function public.sync_income_twin();

insert into public.categories (user_id, name, color, icon, kind, offsets_category_id)
select e.user_id, e.name, e.color, e.icon, 'income', e.id
  from public.categories e
 where e.kind = 'expense'
   and not exists (
     select 1 from public.categories i
      where i.kind = 'income' and i.offsets_category_id = e.id
   )
on conflict (user_id, name, kind) do nothing;
