-- Add category_id to debts so each debt payment inherits the category
ALTER TABLE public.debts
ADD COLUMN category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL;
