-- Second half of the category merge: retire the columns now that no client
-- selects them. Held back from the merge migration deliberately, because
-- dropping a column the running app still asks for breaks it mid-session.
--
-- Postgres drops the dependent constraints and indexes along with each
-- column, which is most of the kind machinery:
--   kind                -> categories_kind_check, categories_income_has_no_budget,
--                          categories_only_income_offsets,
--                          categories_twin_flag_expense_only,
--                          categories_user_id_name_kind_key, categories_user_kind_idx
--   offsets_category_id -> categories_offset_not_self,
--                          categories_offsets_category_id_fkey, categories_offsets_idx
--
-- Note what goes with `kind`: categories_income_has_no_budget forbade a
-- budget on an income category. A category now works in both directions,
-- so any of them may carry one.
alter table public.categories
  drop column if exists offsets_category_id,
  drop column if exists wants_income_twin,
  drop column if exists kind;

-- The uniqueness rule was (user_id, name, kind), which is what allowed a
-- spending "Investissement" and an income one to coexist. One row per name
-- per user now.
alter table public.categories
  add constraint categories_user_id_name_key unique (user_id, name);
