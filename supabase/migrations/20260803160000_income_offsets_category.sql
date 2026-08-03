-- Let a single income row declare that it came back on its category rather
-- than being earnings.
--
-- The refund link already does this exactly, but only when the money maps to
-- one specific expense. Two real cases do not: a gambling payout is not a
-- refund of any one stake, and Virements holds family transfers (earnings)
-- next to reimbursements (not earnings) under the same name. Both need the
-- decision made per transaction, which is the granularity the retired
-- per-category twin flag never had.
alter table public.transactions
  add column if not exists offsets_category boolean not null default false;

comment on column public.transactions.offsets_category is
  'Income only: this money came back on its category rather than being earnings, so it reduces that category''s spend instead of counting as income. Per transaction, because one category legitimately holds both kinds.';

-- Normalise rather than reject. Flipping an income row to an expense, or
-- clearing its category, would otherwise fail the check below mid-edit and
-- surface as an opaque constraint error on an ordinary save.
create or replace function public.normalise_offsets_category()
returns trigger
language plpgsql
as $function$
begin
  if new.type <> 'income'
     or new.category_id is null
     or new.refund_of_transaction_id is not null then
    new.offsets_category := false;
  end if;
  return new;
end;
$function$;

drop trigger if exists transactions_normalise_offsets on public.transactions;
create trigger transactions_normalise_offsets
  before insert or update on public.transactions
  for each row execute function public.normalise_offsets_category();

-- A linked refund already nets through its expense's refunded_amount.
-- Letting a row do both would take the same money off twice.
alter table public.transactions
  drop constraint if exists transactions_offsets_income_only;
alter table public.transactions
  add constraint transactions_offsets_income_only
  check (
    not offsets_category
    or (type = 'income' and category_id is not null and refund_of_transaction_id is null)
  );

create index if not exists transactions_offsets_category_idx
  on public.transactions (user_id, category_id)
  where offsets_category;
