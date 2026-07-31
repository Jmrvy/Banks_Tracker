-- Which categories feed the savings page, chosen rather than guessed.
--
-- The page matched category names against 'investissement'/'investment' at
-- render time, so a category called Épargne or PEA was invisible and any
-- category with "investment" in its name was swept in whether or not it
-- belonged. Seeding the flag from that same pattern keeps every existing
-- page showing exactly what it showed before.

alter table public.categories
  add column if not exists counts_as_savings boolean not null default false;

update public.categories
   set counts_as_savings = true
 where name ilike '%investissement%'
    or name ilike '%investment%';

create index if not exists categories_user_savings_idx
  on public.categories (user_id)
  where counts_as_savings;

comment on column public.categories.counts_as_savings is
  'Counts toward the savings page. Set on both sides: contributions are expenses, withdrawals and returns are income, and the page nets them.';
