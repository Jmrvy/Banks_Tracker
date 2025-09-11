-- Update the balance update function to handle transfers
CREATE OR REPLACE FUNCTION public.update_account_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Handle INSERT
    IF TG_OP = 'INSERT' THEN
        IF NEW.type = 'income' THEN
            UPDATE public.accounts 
            SET balance = balance + NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF NEW.type = 'expense' THEN
            UPDATE public.accounts 
            SET balance = balance - NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF NEW.type = 'transfer' THEN
            -- Deduct transfer amount + fee from source account
            UPDATE public.accounts 
            SET balance = balance - NEW.amount - COALESCE(NEW.transfer_fee, 0)
            WHERE id = NEW.account_id;
            
            -- Add transfer amount to destination account
            IF NEW.transfer_to_account_id IS NOT NULL THEN
                UPDATE public.accounts 
                SET balance = balance + NEW.amount 
                WHERE id = NEW.transfer_to_account_id;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Handle UPDATE
    IF TG_OP = 'UPDATE' THEN
        -- Reverse old transaction
        IF OLD.type = 'income' THEN
            UPDATE public.accounts 
            SET balance = balance - OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF OLD.type = 'expense' THEN
            UPDATE public.accounts 
            SET balance = balance + OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF OLD.type = 'transfer' THEN
            -- Reverse old transfer
            UPDATE public.accounts 
            SET balance = balance + OLD.amount + COALESCE(OLD.transfer_fee, 0)
            WHERE id = OLD.account_id;
            
            IF OLD.transfer_to_account_id IS NOT NULL THEN
                UPDATE public.accounts 
                SET balance = balance - OLD.amount 
                WHERE id = OLD.transfer_to_account_id;
            END IF;
        END IF;
        
        -- Apply new transaction
        IF NEW.type = 'income' THEN
            UPDATE public.accounts 
            SET balance = balance + NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF NEW.type = 'expense' THEN
            UPDATE public.accounts 
            SET balance = balance - NEW.amount 
            WHERE id = NEW.account_id;
        ELSIF NEW.type = 'transfer' THEN
            -- Apply new transfer
            UPDATE public.accounts 
            SET balance = balance - NEW.amount - COALESCE(NEW.transfer_fee, 0)
            WHERE id = NEW.account_id;
            
            IF NEW.transfer_to_account_id IS NOT NULL THEN
                UPDATE public.accounts 
                SET balance = balance + NEW.amount 
                WHERE id = NEW.transfer_to_account_id;
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    -- Handle DELETE
    IF TG_OP = 'DELETE' THEN
        IF OLD.type = 'income' THEN
            UPDATE public.accounts 
            SET balance = balance - OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF OLD.type = 'expense' THEN
            UPDATE public.accounts 
            SET balance = balance + OLD.amount 
            WHERE id = OLD.account_id;
        ELSIF OLD.type = 'transfer' THEN
            -- Reverse transfer
            UPDATE public.accounts 
            SET balance = balance + OLD.amount + COALESCE(OLD.transfer_fee, 0)
            WHERE id = OLD.account_id;
            
            IF OLD.transfer_to_account_id IS NOT NULL THEN
                UPDATE public.accounts 
                SET balance = balance - OLD.amount 
                WHERE id = OLD.transfer_to_account_id;
            END IF;
        END IF;
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;

-- Create the trigger if it doesn't exist
DROP TRIGGER IF EXISTS trigger_update_account_balance ON public.transactions;
CREATE TRIGGER trigger_update_account_balance
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_account_balance();