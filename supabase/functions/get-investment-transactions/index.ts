import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

interface RequestBody {
  email: string;
  password: string;
  categories?: string[]; // Optional: filter by specific categories
  start_date?: string; // Optional: filter by date range
  end_date?: string; // Optional: filter by date range
  description_filter?: string; // Optional: filter by description keyword (case-insensitive)
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
    const { email, password, categories, start_date, end_date, description_filter }: RequestBody = await req.json();

    if (!email || !password) {
      return new Response(
        JSON.stringify({ error: 'Email and password are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

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

    // Build query for transactions with categories
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
        include_in_stats,
        category_id,
        categories (
          id,
          name,
          color
        ),
        account_id,
        accounts!transactions_account_id_fkey (
          id,
          name,
          account_type
        )
      `)
      .eq('user_id', userId)
      .eq('include_in_stats', true);

    // Filter by categories if provided
    if (categories && categories.length > 0) {
      // Get category IDs from names
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
      }
    }

    // Filter by date range if provided
    if (start_date) {
      query = query.gte('value_date', start_date);
    }
    if (end_date) {
      query = query.lte('value_date', end_date);
    }

    // Filter by description keyword if provided (case-insensitive search)
    if (description_filter) {
      query = query.ilike('description', `%${description_filter}%`);
    }

    // Order by date descending
    query = query.order('value_date', { ascending: false });

    // Execute query
    const { data: transactions, error: txError } = await query;

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

    console.log(`Retrieved ${transactions?.length || 0} transactions`);

    // Calculate detailed summary statistics
    const expenses = transactions?.filter(tx => tx.type === 'expense') || [];
    const income = transactions?.filter(tx => tx.type === 'income') || [];
    
    const totalExpenses = expenses.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const totalIncome = income.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const netTotal = totalIncome - totalExpenses;
    
    const summary = {
      total_transactions: transactions?.length || 0,
      expense_count: expenses.length,
      income_count: income.length,
      total_expenses: totalExpenses,
      total_income: totalIncome,
      net_total: netTotal,
      categories: Array.from(new Set(transactions?.map(tx => tx.categories?.name).filter(Boolean))),
    };

    return new Response(
      JSON.stringify({ 
        success: true,
        data: transactions,
        summary,
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
