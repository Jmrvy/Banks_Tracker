-- Create a junction table for many-to-many relationship between transactions and categories
CREATE TABLE public.transaction_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID NOT NULL REFERENCES public.transactions(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  user_id UUID NOT NULL,
  UNIQUE(transaction_id, category_id)
);

-- Enable RLS
ALTER TABLE public.transaction_categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own transaction categories" 
ON public.transaction_categories 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own transaction categories" 
ON public.transaction_categories 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own transaction categories" 
ON public.transaction_categories 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for better performance
CREATE INDEX idx_transaction_categories_transaction ON public.transaction_categories(transaction_id);
CREATE INDEX idx_transaction_categories_category ON public.transaction_categories(category_id);
CREATE INDEX idx_transaction_categories_user ON public.transaction_categories(user_id);

-- Migrate existing data: copy category_id from transactions to the new junction table
INSERT INTO public.transaction_categories (transaction_id, category_id, user_id)
SELECT id, category_id, user_id 
FROM public.transactions 
WHERE category_id IS NOT NULL;