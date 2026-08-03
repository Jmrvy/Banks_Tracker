-- Collapse the two-row category model (one expense row + one income twin)
-- into a single row per name that works on both sides.
--
-- The twins existed to answer "does income here reduce the budget?", but
-- that is a question about a transaction, not a category: the same category
-- legitimately holds both earnings and money coming back. Virements is the
-- proof -- family transfers are earnings, the reimbursements filed beside
-- them are not, and no per-category flag can be right for both. Netting now
-- happens only through an explicit refund/repayment link, which is exact.
--
-- This migration moves data and drops the kind machinery. The columns
-- themselves (kind, offsets_category_id, wants_income_twin) are dropped in
-- a follow-up, once the client no longer selects them.

-- Every one of these encodes the split we are removing. sync_income_twin
-- would re-create twins mid-merge; enforce_category_kind would reject the
-- repointing of income rows onto what is currently an expense category.
drop trigger if exists categories_income_twin on public.categories;
drop trigger if exists categories_normalise_twin_flag on public.categories;
drop trigger if exists categories_offset_target on public.categories;
drop trigger if exists transactions_category_kind on public.transactions;
drop function if exists public.sync_income_twin();
drop function if exists public.normalise_twin_flag();
drop function if exists public.enforce_offset_target();
drop function if exists public.enforce_category_kind();

-- offsets_category_id is a self-FK with ON DELETE CASCADE. Deleting a row
-- that another category points at would take that category with it, so
-- clear every pointer before any delete happens.
update public.categories set offsets_category_id = null
 where offsets_category_id is not null;

-- The merge plan: one winner per (user, accent-and-case-insensitive name).
-- Winner is whichever row is actually in use, preferring the one carrying a
-- budget, then the expense row, then the oldest.
create table public._category_merge_plan as
with usage as (
  select c.id, c.user_id, c.name, c.kind, c.budget, c.created_at,
         (select count(*) from public.transactions x           where x.category_id = c.id)
       + (select count(*) from public.transaction_categories x where x.category_id = c.id)
       + (select count(*) from public.recurring_transactions x where x.category_id = c.id)
       + (select count(*) from public.installment_payments x   where x.category_id = c.id)
       + (select count(*) from public.debts x                  where x.category_id = c.id)
       + (select count(*) from public.notification_logs x      where x.category_id = c.id) as refs
    from public.categories c
), keyed as (
  select u.*,
         lower(btrim(translate(u.name,
           'àâäéèêëîïôöùûüÿçÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ',
           'aaaeeeeiioouuuycAAAEEEEIIOOUUUYC'))) as norm
    from usage u
)
select k.id, k.user_id, k.refs,
       first_value(k.id) over w as winner_id
  from keyed k
  window w as (
    partition by k.user_id, k.norm
    order by k.refs desc, (k.budget is not null) desc, (k.kind = 'expense') desc,
             k.created_at asc, k.id asc
  );

-- Multi-category links are unique on (transaction_id, category_id): drop the
-- loser's row where the winner already carries the same transaction, so the
-- repoint below cannot collide.
delete from public.transaction_categories tc
 using public._category_merge_plan p
 where tc.category_id = p.id
   and p.id <> p.winner_id
   and exists (
     select 1 from public.transaction_categories w
      where w.transaction_id = tc.transaction_id
        and w.category_id = p.winner_id
   );

update public.transactions t set category_id = p.winner_id
  from public._category_merge_plan p
 where t.category_id = p.id and p.id <> p.winner_id;

update public.transaction_categories tc set category_id = p.winner_id
  from public._category_merge_plan p
 where tc.category_id = p.id and p.id <> p.winner_id;

update public.recurring_transactions r set category_id = p.winner_id
  from public._category_merge_plan p
 where r.category_id = p.id and p.id <> p.winner_id;

update public.installment_payments i set category_id = p.winner_id
  from public._category_merge_plan p
 where i.category_id = p.id and p.id <> p.winner_id;

update public.debts d set category_id = p.winner_id
  from public._category_merge_plan p
 where d.category_id = p.id and p.id <> p.winner_id;

update public.notification_logs n set category_id = p.winner_id
  from public._category_merge_plan p
 where n.category_id = p.id and p.id <> p.winner_id;

-- Carry the losers' settings onto the survivor rather than losing them: a
-- savings flag set on either side stays set, and a budget survives even if
-- the row that held it was not the winner.
update public.categories c
   set counts_as_savings = true
  from public._category_merge_plan p
 where c.id = p.winner_id
   and p.id <> p.winner_id
   and exists (select 1 from public.categories l where l.id = p.id and l.counts_as_savings);

update public.categories c
   set budget = sub.budget
  from (
    select p.winner_id, max(l.budget) as budget
      from public._category_merge_plan p
      join public.categories l on l.id = p.id
     where p.id <> p.winner_id and l.budget is not null
     group by p.winner_id
  ) sub
 where c.id = sub.winner_id and c.budget is null;

delete from public.categories c
 using public._category_merge_plan p
 where c.id = p.id and p.id <> p.winner_id;

-- Every surviving row now works on both sides. `kind` is pinned to a single
-- value so the column reads as meaningless until it is dropped, rather than
-- leaving half the rows claiming to be income-only.
update public.categories set kind = 'expense', wants_income_twin = false
 where kind <> 'expense' or wants_income_twin;

drop table public._category_merge_plan;
