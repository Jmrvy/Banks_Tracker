-- A transfer can carry the same mark an income row already can: this
-- principal came back on its category. Until the mark is set the original
-- expense stays in the budget, because a transfer between the user's own
-- accounts is not itself a return. The fee is untouched — only the
-- principal reduces the category, and it is not earnings.
--
-- The trigger still clears the flag when the row cannot hold it, so
-- flipping a transfer back to an expense does not fail the check mid-edit.

create or replace function public.normalise_offsets_category()
returns trigger
language plpgsql
as $function$
begin
  if new.type not in ('income', 'transfer')
     or new.category_id is null
     or new.refund_of_transaction_id is not null then
    new.offsets_category := false;
  end if;
  return new;
end;
$function$;

alter table public.transactions
  drop constraint if exists transactions_offsets_income_only;
alter table public.transactions
  add constraint transactions_offsets_income_only
  check (
    not offsets_category
    or (
      type in ('income', 'transfer')
      and category_id is not null
      and refund_of_transaction_id is null
    )
  );

comment on column public.transactions.offsets_category is
  'Income, or a transfer the user marked as money put back: this principal came back on its category, so it reduces that category''s spend. It is not earnings. A transfer''s fee still counts. Until the mark is set, the original expense stays.';
