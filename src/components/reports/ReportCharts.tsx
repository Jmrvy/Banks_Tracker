import { forwardRef, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend,
} from "recharts";

interface CategoryData {
  name: string;
  spent: number;
  color: string;
  percentage?: number;
}

interface EvolutionData {
  date: string;
  balance: number;
  income: number;
  expense: number;
}

interface BudgetData {
  name: string;
  spent: number;
  budget: number;
  color: string;
}

interface ReportChartsProps {
  categoryData: CategoryData[];
  evolutionData: EvolutionData[];
  budgetData: BudgetData[];
  totalIncome: number;
  totalExpenses: number;
  formatCurrency: (value: number) => string;
}

const CHART_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1"
];

// Category Pie Chart
export const CategoryPieChart = forwardRef<HTMLDivElement, {
  data: CategoryData[];
  totalExpenses: number;
  formatCurrency: (value: number) => string;
}>(({ data, totalExpenses, formatCurrency }, ref) => {
  const chartData = useMemo(() =>
    data.slice(0, 8).map((item, index) => ({
      ...item,
      fill: item.color || CHART_COLORS[index % CHART_COLORS.length],
      percentage: totalExpenses > 0 ? ((item.spent / totalExpenses) * 100).toFixed(1) : "0"
    })),
    [data, totalExpenses]
  );

  if (chartData.length === 0) return null;

  return (
    <div ref={ref} className="bg-white p-6 rounded-xl" style={{ width: 500, height: 350 }}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
        Repartition des Depenses
      </h3>
      <div className="flex items-start gap-4">
        <ResponsiveContainer width={220} height={250}>
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={90}
              paddingAngle={2}
              dataKey="spent"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatCurrency(value)}
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px'
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="flex-1 space-y-2">
          {chartData.map((item, index) => (
            <div key={index} className="flex items-center gap-2 text-xs">
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.fill }}
              />
              <span className="text-gray-700 truncate flex-1" style={{ maxWidth: 120 }}>
                {item.name}
              </span>
              <span className="text-gray-900 font-semibold whitespace-nowrap">
                {item.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 text-center">
        <span className="text-sm text-gray-500">Total: </span>
        <span className="text-lg font-bold text-red-600">{formatCurrency(totalExpenses)}</span>
      </div>
    </div>
  );
});

CategoryPieChart.displayName = "CategoryPieChart";

// Balance Evolution Chart
export const BalanceEvolutionChart = forwardRef<HTMLDivElement, {
  data: EvolutionData[];
  formatCurrency: (value: number) => string;
}>(({ data, formatCurrency }, ref) => {
  if (data.length === 0) return null;

  return (
    <div ref={ref} className="bg-white p-6 rounded-xl" style={{ width: 550, height: 320 }}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
        Evolution du Solde
      </h3>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="colorBalance" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4}/>
              <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.05}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="date"
            fontSize={10}
            stroke="#6b7280"
            tickLine={false}
          />
          <YAxis
            fontSize={10}
            stroke="#6b7280"
            tickLine={false}
            tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
          />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#3B82F6"
            strokeWidth={2}
            fill="url(#colorBalance)"
            name="Solde"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
});

BalanceEvolutionChart.displayName = "BalanceEvolutionChart";

// Income vs Expenses Bar Chart
export const IncomeExpensesChart = forwardRef<HTMLDivElement, {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  formatCurrency: (value: number) => string;
}>(({ totalIncome, totalExpenses, netBalance, formatCurrency }, ref) => {
  const data = [
    { name: "Revenus", value: totalIncome, fill: "#10B981" },
    { name: "Depenses", value: totalExpenses, fill: "#EF4444" },
  ];

  return (
    <div ref={ref} className="bg-white p-6 rounded-xl" style={{ width: 400, height: 300 }}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
        Revenus vs Depenses
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} layout="vertical" margin={{ left: 20, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
          <XAxis type="number" fontSize={10} stroke="#6b7280" tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
          <YAxis type="category" dataKey="name" fontSize={12} stroke="#6b7280" width={70} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="mt-4 pt-3 border-t border-gray-200 text-center">
        <span className="text-sm text-gray-500">Solde net: </span>
        <span className={`text-xl font-bold ${netBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
          {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
        </span>
      </div>
    </div>
  );
});

IncomeExpensesChart.displayName = "IncomeExpensesChart";

// Budget Progress Chart
export const BudgetProgressChart = forwardRef<HTMLDivElement, {
  data: BudgetData[];
  formatCurrency: (value: number) => string;
}>(({ data, formatCurrency }, ref) => {
  const chartData = useMemo(() =>
    data.slice(0, 6).map(item => ({
      ...item,
      percentage: item.budget > 0 ? Math.min((item.spent / item.budget) * 100, 150) : 0,
      remaining: Math.max(item.budget - item.spent, 0),
      status: item.budget > 0
        ? item.spent > item.budget
          ? 'exceeded'
          : item.spent > item.budget * 0.8
            ? 'warning'
            : 'ok'
        : 'ok'
    })),
    [data]
  );

  if (chartData.length === 0) return null;

  return (
    <div ref={ref} className="bg-white p-6 rounded-xl" style={{ width: 480, height: 320 }}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
        Suivi des Budgets
      </h3>
      <div className="space-y-4">
        {chartData.map((item, index) => (
          <div key={index} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-gray-700 font-medium">{item.name}</span>
              <span className="text-gray-500">
                {formatCurrency(item.spent)} / {formatCurrency(item.budget)}
              </span>
            </div>
            <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  item.status === 'exceeded'
                    ? 'bg-red-500'
                    : item.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-green-500'
                }`}
                style={{ width: `${Math.min(item.percentage, 100)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>{item.percentage.toFixed(0)}% utilise</span>
              <span
                className={item.status === 'exceeded' ? 'text-red-500 font-semibold' : ''}
              >
                {item.status === 'exceeded'
                  ? `Depasse de ${formatCurrency(item.spent - item.budget)}`
                  : `Reste ${formatCurrency(item.remaining)}`
                }
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

BudgetProgressChart.displayName = "BudgetProgressChart";

// Summary Cards Component
export const SummaryCards = forwardRef<HTMLDivElement, {
  totalIncome: number;
  totalExpenses: number;
  netBalance: number;
  initialBalance: number;
  finalBalance: number;
  transactionCount: number;
  formatCurrency: (value: number) => string;
}>(({ totalIncome, totalExpenses, netBalance, initialBalance, finalBalance, transactionCount, formatCurrency }, ref) => {
  return (
    <div ref={ref} className="bg-gradient-to-br from-blue-600 to-blue-800 p-6 rounded-xl text-white" style={{ width: 550, height: 200 }}>
      <h3 className="text-lg font-bold mb-4 text-center">Synthese Financiere</h3>
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-100 mb-1">Revenus</div>
          <div className="text-lg font-bold text-green-300">+{formatCurrency(totalIncome)}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-100 mb-1">Depenses</div>
          <div className="text-lg font-bold text-red-300">-{formatCurrency(totalExpenses)}</div>
        </div>
        <div className="bg-white/10 rounded-lg p-3 text-center">
          <div className="text-xs text-blue-100 mb-1">Solde Net</div>
          <div className={`text-lg font-bold ${netBalance >= 0 ? 'text-green-300' : 'text-red-300'}`}>
            {netBalance >= 0 ? '+' : ''}{formatCurrency(netBalance)}
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-4 pt-3 border-t border-white/20 text-sm">
        <div>
          <span className="text-blue-200">Solde initial: </span>
          <span className="font-semibold">{formatCurrency(initialBalance)}</span>
        </div>
        <div>
          <span className="text-blue-200">Solde final: </span>
          <span className="font-semibold">{formatCurrency(finalBalance)}</span>
        </div>
        <div>
          <span className="text-blue-200">Transactions: </span>
          <span className="font-semibold">{transactionCount}</span>
        </div>
      </div>
    </div>
  );
});

SummaryCards.displayName = "SummaryCards";

// Top Categories Chart (Horizontal Bar)
export const TopCategoriesChart = forwardRef<HTMLDivElement, {
  data: CategoryData[];
  formatCurrency: (value: number) => string;
}>(({ data, formatCurrency }, ref) => {
  const chartData = data.slice(0, 5).map((item, index) => ({
    name: item.name.length > 15 ? item.name.substring(0, 15) + '...' : item.name,
    value: item.spent,
    fill: item.color || CHART_COLORS[index % CHART_COLORS.length]
  }));

  if (chartData.length === 0) return null;

  return (
    <div ref={ref} className="bg-white p-6 rounded-xl" style={{ width: 450, height: 280 }}>
      <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
        Top 5 Categories
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={true} vertical={false} />
          <XAxis type="number" fontSize={10} stroke="#6b7280" tickFormatter={(v) => `${v.toFixed(0)}`} />
          <YAxis type="category" dataKey="name" fontSize={10} stroke="#6b7280" width={90} />
          <Tooltip
            formatter={(value: number) => formatCurrency(value)}
            contentStyle={{
              backgroundColor: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px'
            }}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
});

TopCategoriesChart.displayName = "TopCategoriesChart";
