-- Repaying an advance, mirroring how a refund nets against an expense.
--
-- A refund is income that gives back an expense: the expense carries
-- refunded_amount and counts net. An advance is the same shape reflected —
-- income you owe back, settled by an expense — and had no representation at
-- all, so an advance inflated one month's income and its repayment showed
-- up as spending in another.

alter table public.transactions
  add column if not exists repaid_amount numeric not null default 0;

alter table public.transactions
  add column if not exists repayment_of_transaction_id uuid
  references public.transactions(id) on delete set null;

alter table public.transactions
  drop constraint if exists transactions_repaid_amount_positive;

alter table public.transactions
  add constraint transactions_repaid_amount_positive
  check (repaid_amount >= 0);

alter table public.transactions
  drop constraint if exists transactions_one_link_only;

alter table public.transactions
  add constraint transactions_one_link_only
  check (refund_of_transaction_id is null or repayment_of_transaction_id is null);

create index if not exists transactions_repayment_of_idx
  on public.transactions (repayment_of_transaction_id)
  where repayment_of_transaction_id is not null;

comment on column public.transactions.repaid_amount is
  'On an income row: how much of it has since been paid back. The income counts net of this.';
comment on column public.transactions.repayment_of_transaction_id is
  'On an expense row: the income this repays. Such a row is a settlement, not spending, and is excluded from expense totals.';
