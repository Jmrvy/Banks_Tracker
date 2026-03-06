import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface RequestBody {
  email: string;
  password: string;
  // Filtering options
  categories?: string[]; // Filter by category names
  transaction_types?: ('expense' | 'income' | 'transfer')[]; // Filter by transaction type
  accounts?: string[]; // Filter by account names
  description_filter?: string; // Filter by description keyword (case-insensitive)
  start_date?: string; // Filter by date range (YYYY-MM-DD)
  end_date?: string; // Filter by date range (YYYY-MM-DD)
  date_type?: 'transaction_date' | 'value_date'; // Which date to use for filtering (default: value_date)
  include_in_stats?: boolean; // Filter by include_in_stats (default: all)
  min_amount?: number; // Filter by minimum amount
  max_amount?: number; // Filter by maximum amount
  // Pagination
  limit?: number; // Maximum number of results (default: 1000, max: 5000)
  offset?: number; // Offset for pagination (default: 0)
  // Sorting
  sort_by?: 'date' | 'amount' | 'description'; // Field to sort by (default: date)
  sort_order?: 'asc' | 'desc'; // Sort order (default: desc)
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify API key
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey || apiKey !== Deno.env.get('API_KEY')) {
      console.error('Invalid or missing API key');
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Invalid API key' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();
    const { 
      email, 
      password, 
      categories, 
      transaction_types,
      accounts,
      description_filter,
      start_date, 
      end_date,
      date_type = 'value_date',
      include_in_stats,
      min_amount,
      max_amount,
      limit = 1000,
      offset = 0,
      sort_by = 'date',
      sort_order = 'desc'
    } = body;

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate pagination limits
    const effectiveLimit = Math.min(Math.max(1, limit), 5000);
    const effectiveOffset = Math.max(0, offset);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Authenticate user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError || !authData.user) {
      console.error('Authentication failed:', authError);
      return new Response(
        JSON.stringify({ error: 'Authentication failed - Invalid credentials' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const userId = authData.user.id;
    console.log('User authenticated:', userId);

    // Build query for transactions with categories and accounts
    let query = supabase
      .from('transactions')
      .select(`
        id,
        description,
        amount,
        type,
        transaction_date,
        value_date,
        created_at,
        updated_at,
        include_in_stats,
        transfer_fee,
        transfer_to_account_id,
        category_id,
        categories (
          id,
          name,
          color,
          budget
        ),
        account_id,
        accounts!transactions_account_id_fkey (
          id,
          name,
          account_type,
          bank
        )
      `, { count: 'exact' })
      .eq('user_id', userId);

    // Filter by include_in_stats if specified
    if (include_in_stats !== undefined) {
      query = query.eq('include_in_stats', include_in_stats);
    }

    // Filter by transaction types if provided
    if (transaction_types && transaction_types.length > 0) {
      query = query.in('type', transaction_types);
    }

    // Filter by categories if provided
    if (categories && categories.length > 0) {
      const { data: categoryData, error: categoryError } = await supabase
        .from('categories')
        .select('id')
        .eq('user_id', userId)
        .in('name', categories);

      if (categoryError) {
        console.error('Error fetching categories:', categoryError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch categories' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (categoryData && categoryData.length > 0) {
        const categoryIds = categoryData.map(cat => cat.id);
        query = query.in('category_id', categoryIds);
      } else {
        // No matching categories found, return empty result
        return new Response(
          JSON.stringify({ 
            success: true,
            data: [],
            summary: {
              total_transactions: 0,
              expense_count: 0,
              income_count: 0,
              transfer_count: 0,
              total_expenses: 0,
              total_income: 0,
              total_transfers: 0,
              net_total: 0,
              categories: [],
              accounts: [],
            },
            pagination: {
              limit: effectiveLimit,
              offset: effectiveOffset,
              total: 0,
              has_more: false
            }
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Filter by accounts if provided
    if (accounts && accounts.length > 0) {
      const { data: accountData, error: accountError } = await supabase
        .from('accounts')
        .select('id')
        .eq('user_id', userId)
        .in('name', accounts);

      if (accountError) {
        console.error('Error fetching accounts:', accountError);
        return new Response(
          JSON.stringify({ error: 'Failed to fetch accounts' }),
          { 
            status: 500, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      if (accountData && accountData.length > 0) {
        const accountIds = accountData.map(acc => acc.id);
        query = query.in('account_id', accountIds);
      } else {
        // No matching accounts found, return empty result
        return new Response(
          JSON.stringify({ 
            success: true,
            data: [],
            summary: {
              total_transactions: 0,
              expense_count: 0,
              income_count: 0,
              transfer_count: 0,
              total_expenses: 0,
              total_income: 0,
              total_transfers: 0,
              net_total: 0,
              categories: [],
              accounts: [],
            },
            pagination: {
              limit: effectiveLimit,
              offset: effectiveOffset,
              total: 0,
              has_more: false
            }
          }),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Filter by date range
    const dateField = date_type === 'transaction_date' ? 'transaction_date' : 'value_date';
    if (start_date) {
      query = query.gte(dateField, start_date);
    }
    if (end_date) {
      query = query.lte(dateField, end_date);
    }

    // Filter by description keyword (case-insensitive search)
    if (description_filter) {
      query = query.ilike('description', `%${description_filter}%`);
    }

    // Filter by amount range
    if (min_amount !== undefined) {
      query = query.gte('amount', min_amount);
    }
    if (max_amount !== undefined) {
      query = query.lte('amount', max_amount);
    }

    // Sorting
    let sortField: string;
    switch (sort_by) {
      case 'amount':
        sortField = 'amount';
        break;
      case 'description':
        sortField = 'description';
        break;
      case 'date':
      default:
        sortField = dateField;
        break;
    }
    query = query.order(sortField, { ascending: sort_order === 'asc' });

    // Pagination
    query = query.range(effectiveOffset, effectiveOffset + effectiveLimit - 1);

    // Execute query
    const { data: transactions, error: txError, count } = await query;

    if (txError) {
      console.error('Error fetching transactions:', txError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch transactions' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const totalCount = count || 0;
    console.log(`Retrieved ${transactions?.length || 0} transactions (total: ${totalCount})`);

    // Calculate detailed summary statistics
    const expenses = transactions?.filter(tx => tx.type === 'expense') || [];
    const income = transactions?.filter(tx => tx.type === 'income') || [];
    const transfers = transactions?.filter(tx => tx.type === 'transfer') || [];
    
    const totalExpenses = expenses.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const totalIncome = income.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const totalTransfers = transfers.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const totalTransferFees = transfers.reduce((sum, tx) => sum + Number(tx.transfer_fee || 0), 0);
    const netTotal = totalIncome - totalExpenses - totalTransferFees;

    // Get unique categories and accounts from results
    const uniqueCategories = Array.from(
      new Set(transactions?.map(tx => tx.categories?.name).filter(Boolean))
    );
    const uniqueAccounts = Array.from(
      new Set(transactions?.map(tx => tx.accounts?.name).filter(Boolean))
    );
    
    const summary = {
      total_transactions: totalCount,
      returned_transactions: transactions?.length || 0,
      expense_count: expenses.length,
      income_count: income.length,
      transfer_count: transfers.length,
      total_expenses: Math.round(totalExpenses * 100) / 100,
      total_income: Math.round(totalIncome * 100) / 100,
      total_transfers: Math.round(totalTransfers * 100) / 100,
      total_transfer_fees: Math.round(totalTransferFees * 100) / 100,
      net_total: Math.round(netTotal * 100) / 100,
      categories: uniqueCategories,
      accounts: uniqueAccounts,
      // Category breakdown
      by_category: Object.entries(
        transactions?.reduce((acc, tx) => {
          const catName = tx.categories?.name || 'Sans catégorie';
          if (!acc[catName]) {
            acc[catName] = { count: 0, total: 0, expenses: 0, income: 0 };
          }
          acc[catName].count++;
          acc[catName].total += Number(tx.amount);
          if (tx.type === 'expense') acc[catName].expenses += Number(tx.amount);
          if (tx.type === 'income') acc[catName].income += Number(tx.amount);
          return acc;
        }, {} as Record<string, { count: number; total: number; expenses: number; income: number }>)
      ).map(([name, data]) => ({
        category: name,
        count: data.count,
        total: Math.round(data.total * 100) / 100,
        expenses: Math.round(data.expenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
      })),
      // Account breakdown
      by_account: Object.entries(
        transactions?.reduce((acc, tx) => {
          const accName = tx.accounts?.name || 'Inconnu';
          if (!acc[accName]) {
            acc[accName] = { count: 0, expenses: 0, income: 0, transfers: 0 };
          }
          acc[accName].count++;
          if (tx.type === 'expense') acc[accName].expenses += Number(tx.amount);
          if (tx.type === 'income') acc[accName].income += Number(tx.amount);
          if (tx.type === 'transfer') acc[accName].transfers += Number(tx.amount);
          return acc;
        }, {} as Record<string, { count: number; expenses: number; income: number; transfers: number }>)
      ).map(([name, data]) => ({
        account: name,
        count: data.count,
        expenses: Math.round(data.expenses * 100) / 100,
        income: Math.round(data.income * 100) / 100,
        transfers: Math.round(data.transfers * 100) / 100,
      })),
    };

    const pagination = {
      limit: effectiveLimit,
      offset: effectiveOffset,
      total: totalCount,
      returned: transactions?.length || 0,
      has_more: effectiveOffset + (transactions?.length || 0) < totalCount
    };

    return new Response(
      JSON.stringify({ 
        success: true,
        data: transactions,
        summary,
        pagination,
        filters_applied: {
          categories: categories || null,
          transaction_types: transaction_types || null,
          accounts: accounts || null,
          description_filter: description_filter || null,
          date_range: start_date || end_date ? { start: start_date, end: end_date, date_type } : null,
          amount_range: min_amount !== undefined || max_amount !== undefined ? { min: min_amount, max: max_amount } : null,
          include_in_stats: include_in_stats ?? null,
          sorting: { sort_by, sort_order }
        }
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
