-- A name is unique per side, not across the whole list.
--
-- "Investissement" as an expense (what you put in) and "Investissement" as
-- income (what comes back out) are two different categories describing one
-- activity, and the savings page nets them precisely because they are
-- separate rows. UNIQUE (user_id, name) made that pair impossible, so the
-- direction split could not actually be used for the case that motivated it.

alter table public.categories
  drop constraint if exists categories_user_id_name_key;

alter table public.categories
  add constraint categories_user_id_name_kind_key unique (user_id, name, kind);
