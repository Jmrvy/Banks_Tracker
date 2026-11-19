REVOKE ALL ON FUNCTION public.prepare_foreign_leg() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revalue_foreign_account_on_opening_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revalue_foreign_accounts_on_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_subaccounts_with_parent() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.tx_leg_amount(uuid, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.validate_account_hierarchy() FROM PUBLIC, anon, authenticated;