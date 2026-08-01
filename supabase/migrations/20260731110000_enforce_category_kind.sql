-- A transaction may only use a category from its own side of the ledger.
--
-- The exception is a linked refund. createRefund records one as income
-- carrying the *refunded expense's* category on purpose: that is what keeps
-- the money coming back attached to the budget line it left, and the
-- original's refunded_amount is what nets them. Such a row is part of the
-- expense, not income in its own right, so the rule does not apply to it.

create or replace function public.enforce_category_kind()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
begin
  if new.category_id is null then
    return new;
  end if;

  if new.refund_of_transaction_id is not null then
    return new;
  end if;

  select kind into v_kind from public.categories where id = new.category_id;
  if v_kind is null then
    return new;
  end if;

  if new.type = 'income' and v_kind <> 'income' then
    raise exception 'Income transactions need an income category (got a % category). Link it as a refund if it is money coming back on an expense.', v_kind
      using errcode = 'check_violation';
  end if;

  if new.type in ('expense', 'transfer') and v_kind <> 'expense' then
    raise exception 'A % needs a spending category (got a % category).', new.type, v_kind
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_category_kind on public.transactions;

create trigger transactions_category_kind
  before insert or update of category_id, type, refund_of_transaction_id
  on public.transactions
  for each row
  execute function public.enforce_category_kind();
