-- Fix mutable search_path on update_installment_payments_updated_at
CREATE OR REPLACE FUNCTION public.update_installment_payments_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = 'public'
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;