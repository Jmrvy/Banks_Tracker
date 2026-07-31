-- Categories gain a direction.
--
-- Until now `categories` was one flat list offered on every transaction
-- regardless of its type, so income rows were categorised with expense
-- categories — around a hundred of them across the ledger, plus the
-- deliberate case of investment income tracked for the savings page.
--
-- `kind` splits the list in two so a picker can offer the right half.
-- Everything existing becomes 'expense', which is what it was being used
-- as; no row is reassigned, because which income belongs under which new
-- category is the owner's judgement, not a migration's.

alter table public.categories
  add column if not exists kind text not null default 'expense';

alter table public.categories
  drop constraint if exists categories_kind_check;

alter table public.categories
  add constraint categories_kind_check
  check (kind in ('expense', 'income'));

-- A budget is a ceiling on what leaves. It has no meaning on money coming
-- in, so the column and the kind are not allowed to disagree — the UI
-- clears the budget when a category is switched to income, and this stops
-- anything else from writing the pair the UI will not.
alter table public.categories
  drop constraint if exists categories_income_has_no_budget;

alter table public.categories
  add constraint categories_income_has_no_budget
  check (kind = 'expense' or budget is null);

-- Every read filters on it, always alongside user_id.
create index if not exists categories_user_kind_idx
  on public.categories (user_id, kind);

comment on column public.categories.kind is
  'expense | income — which side of the ledger this category may be assigned to. Budgets exist only on expense categories.';
