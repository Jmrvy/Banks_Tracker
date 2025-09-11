import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { PlusCircle, MinusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useFinancialData } from '@/hooks/useFinancialData';

interface NewTransactionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NewTransactionModal({ open, onOpenChange }: NewTransactionModalProps) {
  const { toast } = useToast();
  const { accounts, categories, createTransaction } = useFinancialData();
  
  const [formData, setFormData] = useState({
    description: '',
    amount: '',
    type: 'expense' as 'income' | 'expense',
    account_id: '',
    category_id: '',
    transaction_date: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.description || !formData.amount || !formData.account_id) {
      toast({
        title: "Missing information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    
    const { error } = await createTransaction({
      description: formData.description,
      amount: parseFloat(formData.amount),
      type: formData.type,
      account_id: formData.account_id,
      category_id: formData.category_id || undefined,
      transaction_date: formData.transaction_date,
    });

    if (error) {
      toast({
        title: "Error creating transaction",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Transaction created",
        description: `${formData.type === 'income' ? 'Income' : 'Expense'} of $${formData.amount} added successfully.`,
      });
      
      // Reset form
      setFormData({
        description: '',
        amount: '',
        type: 'expense',
        account_id: '',
        category_id: '',
        transaction_date: new Date().toISOString().split('T')[0]
      });
      
      onOpenChange(false);
    }
    
    setLoading(false);
  };

  const selectedAccount = accounts.find(acc => acc.id === formData.account_id);
  const selectedCategory = categories.find(cat => cat.id === formData.category_id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {formData.type === 'income' ? (
              <PlusCircle className="h-5 w-5 text-green-500" />
            ) : (
              <MinusCircle className="h-5 w-5 text-red-500" />
            )}
            New Transaction
          </DialogTitle>
          <DialogDescription>
            Add a new {formData.type} transaction to your account
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Transaction Type Toggle */}
          <div className="flex gap-2">
            <Button
              type="button"
              variant={formData.type === 'income' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'income' })}
              className="flex-1"
            >
              <PlusCircle className="h-4 w-4 mr-1" />
              Income
            </Button>
            <Button
              type="button"
              variant={formData.type === 'expense' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormData({ ...formData, type: 'expense' })}
              className="flex-1"
            >
              <MinusCircle className="h-4 w-4 mr-1" />
              Expense
            </Button>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">Description *</Label>
            <Textarea
              id="description"
              placeholder="Enter transaction description..."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              required
            />
          </div>

          {/* Amount */}
          <div className="space-y-2">
            <Label htmlFor="amount">Amount *</Label>
            <Input
              id="amount"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              required
            />
          </div>

          {/* Account Selection */}
          <div className="space-y-2">
            <Label htmlFor="account">Account *</Label>
            <Select 
              value={formData.account_id} 
              onValueChange={(value) => setFormData({ ...formData, account_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    <div className="flex items-center justify-between w-full">
                      <span>{account.name}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {account.bank.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedAccount && (
              <div className="text-sm text-muted-foreground">
                Current balance: ${selectedAccount.balance.toFixed(2)}
              </div>
            )}
          </div>

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category</Label>
            <Select 
              value={formData.category_id} 
              onValueChange={(value) => setFormData({ ...formData, category_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select a category (optional)" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: category.color }}
                      />
                      {category.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Date */}
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={formData.transaction_date}
              onChange={(e) => setFormData({ ...formData, transaction_date: e.target.value })}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Creating...' : `Create ${formData.type}`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}