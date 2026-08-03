import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/components/ui/amount-input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import {
  Wallet, ChevronRight, ChevronLeft, Check, Sparkles,
  CreditCard, Tag, BookOpen, TrendingUp, PieChart,
  Calendar, ArrowLeftRight, BarChart3, Plus, X, Repeat,
  DollarSign, Target, PiggyBank, Scale, History, Receipt,
  Bell, Mail, FileText, Settings, Filter, Pause, Play,
  ArrowUpRight, ArrowDownRight, MousePointerClick,
  Search, Download, Pencil, Trash2, MoreVertical,
  ChevronDown, CheckCircle2, Upload, Clock,
  Command, ShieldCheck, EyeOff, Smartphone, Wifi, AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";

const TOTAL_STEPS = 5;

const bankOptions = [
  { value: 'societe_generale', label: 'Societe Generale' },
  { value: 'revolut', label: 'Revolut' },
  { value: 'boursorama', label: 'Boursorama' },
  { value: 'bnp_paribas', label: 'BNP Paribas' },
  { value: 'credit_agricole', label: 'Credit Agricole' },
  { value: 'lcl', label: 'LCL' },
  { value: 'caisse_epargne', label: 'Caisse d\'Epargne' },
  { value: 'credit_mutuel', label: 'Credit Mutuel' },
  { value: 'other', label: 'Autre' },
];

const accountTypes = [
  { value: 'checking', label: 'Courant' },
  { value: 'savings', label: 'Epargne' },
  { value: 'credit', label: 'Credit' },
  { value: 'investment', label: 'Investissement' },
];

// A category works in both directions, so these are just names: Salaire
// will hold income, Epargne will mostly hold what leaves, and either can
// take the other side without a second category being created for it.
const defaultCategories: { name: string; color: string }[] = [
  { name: 'Alimentation', color: '#10B981' },
  { name: 'Transport', color: '#3B82F6' },
  { name: 'Logement', color: '#8B5CF6' },
  { name: 'Loisirs', color: '#F59E0B' },
  { name: 'Sante', color: '#EF4444' },
  { name: 'Shopping', color: '#EC4899' },
  { name: 'Restaurants', color: '#F97316' },
  { name: 'Abonnements', color: '#06B6D4' },
  { name: 'Salaire', color: '#84CC16' },
  { name: 'Epargne', color: '#6366F1' },
];

const currencyOptions = [
  { value: 'EUR', label: 'Euro', symbol: '\u20AC' },
  { value: 'USD', label: 'Dollar US', symbol: '$' },
  { value: 'GBP', label: 'Livre Sterling', symbol: '\u00A3' },
  { value: 'CHF', label: 'Franc Suisse', symbol: 'CHF' },
];

/* ── Visual mockup for each feature guide ── */
const FeatureMockup = ({ id }: { id: string }) => {
  const mockupWrapper = "rounded-xl border bg-card overflow-hidden text-xs";
  const mockupRow = "flex items-center justify-between px-3 py-2 border-b last:border-0";

  switch (id) {
    /* ── Dashboard: QuickPreview (what users see first) ── */
    case 'dashboard':
      return (
        <div className={mockupWrapper}>
          {/* Hero balance card */}
          <div className="p-3 bg-card border-b border-line">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground mb-0.5">Solde total</p>
                <p className="text-lg font-bold text-success">3 250,00 €</p>
              </div>
              <div className="h-9 w-9 rounded-2xl bg-success/10 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-success" />
              </div>
            </div>
          </div>
          {/* Monthly summary — 3 mini cards */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[10px] text-muted-foreground mb-1.5">Mars 2026</p>
            <div className="grid grid-cols-3 gap-1.5">
              <div className="rounded-lg border p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="h-4 w-4 rounded bg-success/10 flex items-center justify-center">
                    <ArrowDownRight className="w-2.5 h-2.5 text-success" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Revenus</span>
                </div>
                <p className="font-bold text-[11px] text-success">+2 800 €</p>
              </div>
              <div className="rounded-lg border p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="h-4 w-4 rounded bg-destructive/10 flex items-center justify-center">
                    <ArrowUpRight className="w-2.5 h-2.5 text-destructive" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Depenses</span>
                </div>
                <p className="font-bold text-[11px] text-destructive">-1 450 €</p>
              </div>
              <div className="rounded-lg border p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <div className="h-4 w-4 rounded bg-primary/10 flex items-center justify-center">
                    <Wallet className="w-2.5 h-2.5 text-primary" />
                  </div>
                  <span className="text-[9px] text-muted-foreground">Net</span>
                </div>
                <p className="font-bold text-[11px] text-success">+1 350 €</p>
              </div>
            </div>
          </div>
          {/* Accounts + Upcoming side by side */}
          <div className="px-3 py-2 grid grid-cols-2 gap-2">
            <div className="rounded-lg border p-2 space-y-1">
              <div className="flex items-center gap-1 mb-1">
                <CreditCard className="w-2.5 h-2.5 text-primary" />
                <span className="text-[10px] font-semibold">Mes comptes</span>
              </div>
              {['Compte Courant', 'Livret A'].map((n, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-success' : 'bg-success'}`} />
                    <span className="text-[9px]">{n}</span>
                  </div>
                  <span className="text-[9px] font-semibold">{i === 0 ? '2 150 €' : '8 500 €'}</span>
                </div>
              ))}
            </div>
            <div className="rounded-lg border p-2 space-y-1">
              <div className="flex items-center gap-1 mb-1">
                <Calendar className="w-2.5 h-2.5 text-primary" />
                <span className="text-[10px] font-semibold">A venir (7j)</span>
              </div>
              {[{ n: 'Loyer', d: 'Lun 1 avr', a: '-850 €', c: 'text-destructive' }, { n: 'Salaire', d: 'Ven 28 mar', a: '+2 800 €', c: 'text-success' }].map((tx, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-medium">{tx.n}</p>
                    <p className="text-[8px] text-muted-foreground">{tx.d}</p>
                  </div>
                  <span className={`text-[9px] font-semibold ${tx.c}`}>{tx.a}</span>
                </div>
              ))}
            </div>
          </div>
          {/* CTA */}
          <div className="px-3 pb-2.5 pt-0.5">
            <div className="flex items-center justify-center gap-1.5 rounded-lg bg-primary/10 py-1.5">
              <span className="text-[10px] text-primary font-medium">Tableau de bord complet</span>
              <ChevronRight className="h-3 w-3 text-primary" />
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez sur les stats pour voir le detail des transactions</span>
          </div>
        </div>
      );

    /* ── Accounts: List view with total balance card ── */
    case 'accounts':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">Comptes</span>
            </div>
            <div className="h-6 px-2 rounded-md bg-primary text-primary-foreground flex items-center gap-1">
              <Plus className="h-2.5 w-2.5" />
              <span className="text-[10px] font-medium">Nouveau compte</span>
            </div>
          </div>
          {/* Total balance card */}
          <div className="mx-3 mt-2 mb-1.5 rounded-lg border p-2.5 flex items-center justify-between">
            <div>
              <p className="text-[10px] text-muted-foreground">Solde total</p>
              <p className="text-base font-bold">10 970,00 €</p>
            </div>
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Wallet className="h-4 w-4 text-primary" />
            </div>
          </div>
          {/* Account cards */}
          <div className="px-3 pb-2 space-y-1.5">
            <p className="text-[10px] text-muted-foreground font-medium">Tous les comptes (3)</p>
            {[
              { name: 'Compte Courant', bank: 'Societe Generale', type: 'Courant', amount: '2 150,00 €', positive: true },
              { name: 'Livret A', bank: 'Boursorama', type: 'Epargne', amount: '8 500,00 €', positive: true },
              { name: 'Revolut', bank: 'Revolut', type: 'Courant', amount: '320,00 €', positive: true },
            ].map((acc, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-1.5 hover:bg-accent/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-[11px]">{acc.name}</p>
                    <p className="text-[10px] text-muted-foreground">{acc.bank}</p>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded border text-muted-foreground">{acc.type}</span>
                </div>
                <div className="pt-1 border-t">
                  <p className="text-[9px] text-muted-foreground">Solde</p>
                  <p className={`font-bold text-[12px] ${acc.positive ? 'text-success' : 'text-destructive'}`}>{acc.amount}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez sur un compte pour voir ses transactions et graphiques</span>
          </div>
        </div>
      );

    /* ── Transactions: Search + filter + list ── */
    case 'transactions':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="px-3 py-2 border-b">
            <p className="font-semibold flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-primary" />
              Transactions
            </p>
            <p className="text-[10px] text-muted-foreground">Historique complet avec filtres avances</p>
          </div>
          {/* Search bar + filter button */}
          <div className="px-3 py-2 border-b flex gap-1.5">
            <div className="flex-1 flex items-center gap-1.5 rounded-md border px-2 py-1">
              <Search className="h-3 w-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground">Rechercher une transaction...</span>
            </div>
            <div className="flex items-center gap-1 rounded-md border px-2 py-1 relative">
              <Filter className="h-3 w-3" />
              <span className="text-[10px]">Filtres</span>
              <span className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full bg-destructive text-[8px] text-white flex items-center justify-center font-bold">2</span>
            </div>
          </div>
          {/* Transaction rows (matching real app: bank color bar + type icon + desc/cat/date + amount + actions) */}
          {[
            { desc: 'Courses Carrefour', cat: 'Alimentation', catColor: '#22c55e', date: '10/03/2026', account: 'Compte Courant', amount: '-45,90 €', type: 'expense', bankColor: 'bg-red-500' },
            { desc: 'Salaire Mars', cat: 'Salaire', catColor: '#3b82f6', date: '28/02/2026', account: 'Compte Courant', amount: '+2 800,00 €', type: 'income', bankColor: 'bg-red-500' },
            { desc: 'Vers Livret A', cat: 'Virement', catColor: '#8b5cf6', date: '05/03/2026', account: 'Courant → Livret A', amount: '↔500,00 €', type: 'transfer', bankColor: 'bg-blue-500' },
          ].map((tx, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 border-b hover:bg-accent/30">
              <div className="flex items-center gap-1.5">
                {/* Bank color bar */}
                <div className={`w-1 h-5 rounded-full ${tx.bankColor}`} />
                {/* Type icon */}
                <div className={`h-5 w-5 rounded-full flex items-center justify-center ${tx.type === 'income' ? 'bg-muted' : tx.type === 'transfer' ? 'bg-muted' : 'bg-muted'}`}>
                  {tx.type === 'income' && <ArrowDownRight className="w-2.5 h-2.5 text-green-600" />}
                  {tx.type === 'expense' && <ArrowUpRight className="w-2.5 h-2.5 text-red-600" />}
                  {tx.type === 'transfer' && <ArrowLeftRight className="w-2.5 h-2.5 text-blue-600" />}
                </div>
                <div>
                  <p className="font-medium text-[11px]">{tx.desc}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9px] px-1 py-0 rounded text-white" style={{ backgroundColor: tx.catColor }}>{tx.cat}</span>
                    <span className="text-[9px] text-muted-foreground">{tx.date}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <span className={`font-semibold text-[11px] ${tx.type === 'income' ? 'text-green-600' : tx.type === 'transfer' ? 'text-blue-600' : 'text-foreground'}`}>{tx.amount}</span>
                <Pencil className="h-2.5 w-2.5 text-muted-foreground/40" />
                <Trash2 className="h-2.5 w-2.5 text-muted-foreground/40" />
              </div>
            </div>
          ))}
          <div className="px-3 py-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Filtrez par type, categorie, compte, date ou montant</span>
          </div>
        </div>
      );

    /* ── Savings: Stats cards + goals with progress ── */
    case 'savings':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <PiggyBank className="h-3.5 w-3.5 text-primary" />
              <span className="font-semibold">Epargne</span>
              <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded">Mar. 2026</span>
            </div>
            <div className="h-5 px-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" />
              <span className="text-[10px]">Nouveau but</span>
            </div>
          </div>
          {/* Stats cards row */}
          <div className="px-3 py-2 grid grid-cols-3 gap-1.5 border-b">
            <div className="rounded-lg border p-1.5 text-center">
              <p className="text-[9px] text-muted-foreground">Epargne nette</p>
              <p className="font-bold text-[11px] text-success">+4 200 €</p>
            </div>
            <div className="rounded-lg border p-1.5 text-center">
              <p className="text-[9px] text-muted-foreground">Depots</p>
              <p className="font-bold text-[11px] text-success">+5 000 €</p>
            </div>
            <div className="rounded-lg border p-1.5 text-center">
              <p className="text-[9px] text-muted-foreground">Retraits</p>
              <p className="font-bold text-[11px] text-destructive">-800 €</p>
            </div>
          </div>
          {/* Goals */}
          <div className="px-3 py-2 space-y-2">
            <p className="text-[10px] font-semibold text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" /> Objectifs (2)
            </p>
            {[
              { name: 'Vacances ete', current: 1200, target: 2000, pct: 60, color: '#3b82f6', months: 4 },
              { name: 'Fonds urgence', current: 4500, target: 5000, pct: 90, color: '#22c55e', months: 1 },
            ].map((goal, i) => (
              <div key={i} className="rounded-lg border p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: goal.color }} />
                    <span className="font-medium text-[11px]">{goal.name}</span>
                  </div>
                  {goal.pct >= 90 && <span className="text-[9px] px-1 py-0.5 rounded bg-success/10 text-success font-medium">Presque !</span>}
                </div>
                <Progress value={goal.pct} className="h-1.5" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{goal.current.toLocaleString()} / {goal.target.toLocaleString()} €</span>
                  <span>~{goal.months} mois restants</span>
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Toute transaction en categorie investissement est comptee ici</span>
          </div>
        </div>
      );

    /* ── Debts: 3 stats + tabs + expandable debt card ── */
    case 'debts':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div>
              <p className="font-semibold flex items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 text-primary" />
                Gestion des Dettes
              </p>
              <p className="text-[10px] text-muted-foreground ml-5">Suivez vos prets et remboursements</p>
            </div>
            <div className="h-5 px-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" />
              <span className="text-[10px]">Nouvelle dette</span>
            </div>
          </div>
          {/* 3 stat cards: Total dû, Actifs, Terminés */}
          <div className="px-3 py-2 grid grid-cols-3 gap-1.5 border-b">
            <div className="rounded-lg border p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[9px] text-muted-foreground">Total du</p>
                <div className="h-4 w-4 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Wallet className="w-2 h-2 text-destructive" />
                </div>
              </div>
              <p className="font-bold text-[11px]">12 500 €</p>
            </div>
            <div className="rounded-lg border p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[9px] text-muted-foreground">Actifs</p>
                <div className="h-4 w-4 rounded-full bg-success/10 flex items-center justify-center">
                  <Wallet className="w-2 h-2 text-success" />
                </div>
              </div>
              <p className="font-bold text-[11px]">2</p>
            </div>
            <div className="rounded-lg border p-1.5">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-[9px] text-muted-foreground">Termines</p>
                <div className="h-4 w-4 rounded-full bg-muted/20 flex items-center justify-center">
                  <CheckCircle2 className="w-2 h-2 text-muted-foreground" />
                </div>
              </div>
              <p className="font-bold text-[11px]">1</p>
            </div>
          </div>
          {/* Filter tabs */}
          <div className="mx-3 mt-2 rounded-lg bg-muted/30 p-0.5 grid grid-cols-3 gap-0.5">
            {[{ l: 'Actifs', n: 2 }, { l: 'Termines', n: 1 }, { l: 'Tous', n: 3 }].map((tab, i) => (
              <div key={i} className={`text-center py-1 rounded text-[10px] font-medium ${i === 0 ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>
                {tab.l} ({tab.n})
              </div>
            ))}
          </div>
          {/* Expanded debt card with progress */}
          <div className="px-3 py-2 space-y-1.5">
            <div className="rounded-lg border overflow-hidden">
              {/* Card header row */}
              <div className="flex items-center gap-2 p-2">
                <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <Wallet className="h-3 w-3 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px]">Credit immobilier</span>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive">Contracte</span>
                      <ChevronDown className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] mt-0.5">
                    <span className="text-muted-foreground">Restant: <span className="font-bold text-foreground">10 000 €</span></span>
                    <span className="text-muted-foreground">67%</span>
                  </div>
                  <Progress value={67} className="h-1 mt-1" />
                </div>
              </div>
              {/* Expanded details */}
              <div className="border-t bg-muted/5 p-2 space-y-1.5">
                <div className="grid grid-cols-2 gap-1 text-[10px]">
                  <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">30 000 €</span></div>
                  <div><span className="text-muted-foreground">Paye:</span> <span className="font-semibold text-success">20 000 €</span></div>
                  <div><span className="text-muted-foreground">Taux:</span> <span className="font-semibold">2,5%</span></div>
                  <div><span className="text-muted-foreground">Mensualite:</span> <span className="font-semibold">850 €</span></div>
                </div>
                {/* Payment history mini */}
                <div className="border-t pt-1.5">
                  <p className="text-[9px] text-muted-foreground font-medium mb-1">Derniers paiements</p>
                  <div className="space-y-0.5">
                    {[{ d: '01/04/2026', a: '850 €' }, { d: '01/03/2026', a: '850 €' }].map((p, i) => (
                      <div key={i} className="flex items-center justify-between text-[10px]">
                        <span className="text-muted-foreground">{p.d}</span>
                        <span className="font-medium text-success">{p.a}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Action buttons */}
                <div className="flex gap-1 pt-1 border-t">
                  <div className="flex-1 h-5 flex items-center justify-center rounded bg-primary text-primary-foreground text-[9px] font-medium">Paiement</div>
                  <div className="flex-1 h-5 flex items-center justify-center rounded bg-muted text-[9px]"><Upload className="h-2.5 w-2.5 mr-0.5" />CSV</div>
                  <div className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted"><Pencil className="h-2.5 w-2.5 text-muted-foreground" /></div>
                  <div className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted"><History className="h-2.5 w-2.5 text-muted-foreground" /></div>
                </div>
              </div>
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Importez un echeancier CSV et activez le paiement recurrent</span>
          </div>
        </div>
      );

    /* ── Recurring: 3 stats + Calendar view + list card ── */
    case 'recurring':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="flex items-center gap-1.5">
              <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                <Repeat className="h-3 w-3 text-primary" />
              </div>
              <span className="font-semibold">Transactions Recurrentes</span>
            </div>
            <div className="h-5 px-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-0.5">
              <Plus className="h-2.5 w-2.5" />
              <span className="text-[10px]">Nouvelle</span>
            </div>
          </div>
          {/* 3 stats */}
          <div className="px-3 py-2 grid grid-cols-3 gap-1.5 border-b">
            <div className="rounded-lg border p-1.5 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-muted-foreground">Active</p>
                <p className="font-bold text-sm">5</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-success/10 flex items-center justify-center">
                <Play className="h-2.5 w-2.5 text-success" />
              </div>
            </div>
            <div className="rounded-lg border p-1.5 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-muted-foreground">Inactive</p>
                <p className="font-bold text-sm">1</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-muted flex items-center justify-center">
                <Pause className="h-2.5 w-2.5 text-muted-foreground" />
              </div>
            </div>
            <div className="rounded-lg border p-1.5 flex items-center justify-between">
              <div>
                <p className="text-[9px] text-muted-foreground">7 jours</p>
                <p className="font-bold text-sm">2</p>
              </div>
              <div className="h-5 w-5 rounded-full bg-warning/10 flex items-center justify-center">
                <Calendar className="h-2.5 w-2.5 text-warning" />
              </div>
            </div>
          </div>
          {/* Tab switcher */}
          <div className="mx-3 mt-2 rounded-lg bg-muted/30 p-0.5 grid grid-cols-2 gap-0.5">
            <div className="text-center py-1 rounded bg-background shadow-sm text-[10px] font-medium">Calendrier</div>
            <div className="text-center py-1 rounded text-[10px] font-medium text-muted-foreground">Liste</div>
          </div>
          {/* Mini calendar preview */}
          <div className="px-3 py-2">
            <div className="rounded-lg border p-2">
              <div className="grid grid-cols-7 gap-0.5 text-center text-[8px] text-muted-foreground mb-1">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-0.5 text-center text-[9px]">
                {Array.from({ length: 30 }, (_, i) => i + 1).map(day => (
                  <div key={day} className={`py-0.5 rounded ${
                    day === 1 ? 'bg-destructive/20 text-destructive font-bold' :
                    day === 5 ? 'bg-success/20 text-success font-bold' :
                    day === 15 ? 'bg-primary/20 text-primary font-bold' :
                    day === 28 ? 'bg-success/20 text-success font-bold' :
                    ''
                  }`}>{day}</div>
                ))}
              </div>
              <div className="mt-1.5 pt-1.5 border-t space-y-0.5">
                <div className="flex items-center gap-1 text-[9px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">1 avr</span>
                  <span className="font-medium">Loyer</span>
                  <span className="ml-auto font-bold text-destructive">-850 €</span>
                </div>
                <div className="flex items-center gap-1 text-[9px]">
                  <div className="w-1.5 h-1.5 rounded-full bg-success" />
                  <span className="text-muted-foreground">5 avr</span>
                  <span className="font-medium">Salaire</span>
                  <span className="ml-auto font-bold text-success">+2 800 €</span>
                </div>
              </div>
            </div>
          </div>
          {/* Expandable list card preview */}
          <div className="px-3 pb-2">
            <div className="rounded-lg border overflow-hidden">
              <div className="flex items-center gap-2 p-2">
                <div className="h-7 w-7 rounded-lg bg-destructive/10 flex items-center justify-center flex-shrink-0">
                  <ArrowDownRight className="h-3 w-3 text-destructive" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-[11px]">Credit immo</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive">Dette liee</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                    <span>Mensuel</span>
                    <span>·</span>
                    <span>Prochain: 01 mai</span>
                  </div>
                </div>
                <span className="font-bold text-[11px] text-destructive">-850 €</span>
              </div>
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez sur un jour du calendrier pour voir les echeances</span>
          </div>
        </div>
      );

    /* ── Installments: Filter tabs + expandable cards with progress ── */
    case 'installments':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="px-3 py-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <CreditCard className="h-3 w-3 text-primary" />
                </div>
                <span className="font-semibold">Paiements Echelonnes</span>
              </div>
              <div className="h-5 px-1.5 rounded-md bg-primary text-primary-foreground flex items-center gap-0.5">
                <Plus className="h-2.5 w-2.5" />
                <span className="text-[10px]">Nouveau</span>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1 ml-[30px]">Chaque paiement cree automatiquement une recurrence liee</p>
          </div>
          {/* Filter tabs */}
          <div className="mx-3 mt-2 rounded-lg bg-muted/30 p-0.5 grid grid-cols-3 gap-0.5">
            {['Actifs (2)', 'Termines (1)', 'Tous (3)'].map((tab, i) => (
              <div key={i} className={`text-center py-1 rounded text-[10px] font-medium ${i === 0 ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tab}</div>
            ))}
          </div>
          {/* Expanded card */}
          <div className="px-3 py-2 space-y-1.5">
            <div className="rounded-lg border overflow-hidden">
              <div className="p-2 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[11px]">Ordinateur portable</span>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] px-1 py-0.5 rounded border">Paiement</span>
                    <span className="text-[9px] px-1 py-0.5 rounded bg-primary text-primary-foreground">Actif</span>
                    <MoreVertical className="h-3 w-3 text-muted-foreground" />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-muted-foreground">Progression</span>
                    <span className="font-semibold">50%</span>
                  </div>
                  <Progress value={50} className="h-1.5" />
                </div>
                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                  <div className="flex justify-between"><span className="text-muted-foreground">Total:</span><span className="font-bold">1 200 €</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Restant:</span><span className="font-bold text-orange-500">600 €</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Mensualite:</span><span className="font-semibold">300 €</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Echeances:</span><span className="font-semibold">2/4</span></div>
                </div>
              </div>
              {/* Expanded history */}
              <div className="border-t bg-muted/5 p-2 space-y-1">
                <p className="text-[9px] text-muted-foreground font-medium">Historique des echeances</p>
                <div className="space-y-0.5">
                  {[
                    { d: '01/04/2026', paid: true },
                    { d: '01/03/2026', paid: true },
                    { d: '01/05/2026', paid: false },
                    { d: '01/06/2026', paid: false },
                  ].map((h, i) => (
                    <div key={i} className="flex items-center justify-between text-[10px]">
                      <div className="flex items-center gap-1">
                        {h.paid
                          ? <CheckCircle2 className="h-2.5 w-2.5 text-success" />
                          : <Clock className="h-2.5 w-2.5 text-muted-foreground" />
                        }
                        <span className={h.paid ? '' : 'text-muted-foreground'}>{h.d}</span>
                      </div>
                      <span className={`font-medium ${h.paid ? 'text-success' : 'text-muted-foreground'}`}>300 €</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Collapsed card */}
            <div className="rounded-lg border p-2 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-[11px]">Remboursement assurance</span>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] px-1 py-0.5 rounded border border-success text-success">Remboursement</span>
                  <span className="text-[9px] px-1 py-0.5 rounded bg-primary text-primary-foreground">Actif</span>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">Progression</span>
                  <span className="font-semibold">50%</span>
                </div>
                <Progress value={50} className="h-1.5" />
              </div>
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Menu ··· pour ajuster le plan ou voir l'historique complet</span>
          </div>
        </div>
      );

    /* ── Reports: Period selector + 4 tabs + charts ── */
    case 'reports':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div>
              <p className="font-semibold flex items-center gap-1.5">
                <BarChart3 className="h-3.5 w-3.5 text-primary" />
                Rapports
              </p>
              <p className="text-[10px] text-muted-foreground">Mars 2026</p>
            </div>
            <div className="flex items-center gap-1 rounded-md border px-2 py-1">
              <Download className="h-3 w-3" />
              <span className="text-[10px]">Exporter</span>
            </div>
          </div>
          {/* Period selector */}
          <div className="px-3 py-1.5 border-b flex gap-1.5">
            {['Mois', 'Annee', 'Personnalise'].map((p, i) => (
              <span key={i} className={`px-2 py-0.5 rounded text-[10px] font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>{p}</span>
            ))}
          </div>
          {/* 4 tabs */}
          <div className="mx-3 mt-2 rounded-lg bg-muted/30 p-0.5 grid grid-cols-4 gap-0.5">
            {['Evolution', 'Revenus', 'Depenses', 'Recurrents'].map((tab, i) => (
              <div key={i} className={`text-center py-1 rounded text-[9px] font-medium ${i === 2 ? 'bg-background shadow-sm' : 'text-muted-foreground'}`}>{tab}</div>
            ))}
          </div>
          {/* Categories breakdown (Depenses tab) */}
          <div className="px-3 py-2 space-y-1.5">
            {[
              { cat: 'Logement', pct: 58, amount: '850 €', color: '#8b5cf6' },
              { cat: 'Alimentation', pct: 22, amount: '320 €', color: '#22c55e' },
              { cat: 'Transport', pct: 12, amount: '180 €', color: '#3b82f6' },
              { cat: 'Loisirs', pct: 6, amount: '95 €', color: '#f59e0b' },
            ].map((row, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                    <span className="text-[10px] font-medium">{row.cat}</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">{row.amount}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${row.pct}%`, backgroundColor: row.color }} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Changez d'onglet et de periode pour analyser vos finances</span>
          </div>
        </div>
      );

    /* ── Notifications: Settings section toggles + email preview ── */
    case 'notifications':
      return (
        <div className={mockupWrapper}>
          {/* Located in Settings */}
          <div className="px-3 py-2 border-b bg-muted/30 flex items-center gap-1.5">
            <Settings className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">Parametres</span>
            <ChevronRight className="h-2.5 w-2.5 text-muted-foreground" />
            <Bell className="h-3 w-3 text-primary" />
            <span className="text-[10px] font-medium">Notifications par Email</span>
          </div>
          {/* Toggle switches */}
          <div className="px-3 py-2.5 border-b space-y-3">
            {[
              { label: 'Alertes de budget', desc: 'Email quand un budget est depasse', on: true },
              { label: 'Rapports mensuels', desc: 'Resume financier chaque debut de mois', on: true },
            ].map((toggle, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[11px]">{toggle.label}</p>
                  <p className="text-[10px] text-muted-foreground">{toggle.desc}</p>
                </div>
                <div className={`w-8 h-4 rounded-full flex items-center px-0.5 ${toggle.on ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
                  <div className="w-3 h-3 rounded-full bg-white shadow-sm" />
                </div>
              </div>
            ))}
          </div>
          {/* Email preview */}
          <div className="px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Exemples de mails recus</p>
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold">Alerte : Budget Alimentation depasse</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Vous avez depense 420 € sur un budget de 400 €.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold">Rapport mensuel · Fevrier 2026</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Revenus : 2 800 € · Depenses : 1 450 € · PDF joint</p>
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Activez dans Parametres → Notifications par Email</span>
          </div>
        </div>
      );

    /* ── Settings: Section cards list ── */
    case 'settings':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="px-3 py-2 border-b">
            <p className="font-semibold">Parametres</p>
            <p className="text-[10px] text-muted-foreground">Gerer votre profil</p>
          </div>
          {/* Section cards (matching real Settings page) */}
          <div className="px-3 py-2 space-y-1.5">
            {[
              { icon: DollarSign, label: 'Preferences', desc: 'Devise, compte par defaut' },
              { icon: Bell, label: 'Notifications', desc: 'Alertes budget, rapports mensuels' },
              { icon: Wallet, label: 'Comptes', desc: 'Ajouter, modifier, supprimer' },
              { icon: Tag, label: 'Categories', desc: 'Personnaliser noms et couleurs' },
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg border p-2 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-2">
                  <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                    <item.icon className="h-3 w-3 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-[11px]">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
                <ChevronRight className="h-3 w-3 text-muted-foreground/50" />
              </div>
            ))}
            {/* Guide card */}
            <div className="flex items-center justify-between rounded-lg border p-2">
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-3 w-3 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-[11px]">Guide de l'application</p>
                  <p className="text-[10px] text-muted-foreground">Revoir la presentation</p>
                </div>
              </div>
              <div className="rounded border px-1.5 py-0.5 text-[10px] font-medium">Revoir le guide</div>
            </div>
            {/* Sign out */}
            <div className="rounded-lg bg-destructive text-destructive-foreground text-center py-1.5 text-[10px] font-medium mt-1">
              Deconnexion
            </div>
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Tout se configure ici, accessible depuis le menu lateral</span>
          </div>
        </div>
      );

    /* ── Command Palette: bilingual NL search + pinned result ── */
    case 'palette':
      return (
        <div className={mockupWrapper}>
          {/* Mock cmdk surface */}
          <div className="px-3 py-2 border-b flex items-center gap-2">
            <Search className="h-3 w-3 text-muted-foreground" />
            <span className="text-[11px] font-mono text-foreground">expenses loyer ytd</span>
            <span className="ml-auto inline-flex items-center gap-1">
              <span className="text-[9px] font-mono px-1 py-0.5 rounded border bg-muted text-muted-foreground">⌘K</span>
            </span>
          </div>
          {/* Pinned result row */}
          <div className="px-3 py-2 border-b bg-primary/5">
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider mb-1">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              Search result
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium">Expenses</span>
              <span className="text-[10px] text-muted-foreground">· Year to date</span>
              <span className="ml-auto text-[12px] font-bold text-destructive font-mono">-2 840,00 €</span>
            </div>
            <div className="flex flex-wrap items-center gap-1 mt-1">
              <span className="text-[8px] px-1 py-0.5 rounded bg-muted border">Loyer</span>
              <span className="text-[8px] px-1 py-0.5 rounded bg-muted border inline-flex items-center gap-0.5">
                Year to date <X className="h-2 w-2" />
              </span>
              <span className="text-[8px] text-muted-foreground ml-auto">8 transactions</span>
            </div>
          </div>
          {/* Suggested intent rows */}
          <div className="px-3 pt-2 pb-1">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider mb-1">Try a query</p>
          </div>
          {[
            { q: 'budget shopping may', hint: 'budget · category · month' },
            { q: 'top 10 ytd', hint: 'biggest expenses' },
            { q: 'average expenses 2026', hint: 'per day / week / month' },
          ].map((s, i) => (
            <div key={i} className="px-3 py-1.5 border-b last:border-b-0 flex items-center gap-2 hover:bg-accent/30">
              <Sparkles className="h-2.5 w-2.5 text-primary" />
              <span className="text-[10px] font-mono">{s.q}</span>
              <span className="text-[8px] text-muted-foreground ml-auto">{s.hint}</span>
            </div>
          ))}
          {/* Keyboard footer */}
          <div className="px-3 py-1.5 border-t flex items-center gap-2 text-[9px] text-muted-foreground bg-muted/40">
            <span className="inline-flex items-center gap-0.5"><span className="font-mono px-1 rounded border">↑</span><span className="font-mono px-1 rounded border">↓</span> navigate</span>
            <span className="inline-flex items-center gap-0.5"><span className="font-mono px-1 rounded border">↵</span> open</span>
            <span className="inline-flex items-center gap-0.5 ml-auto"><span className="font-mono px-1 rounded border">esc</span> close</span>
          </div>
        </div>
      );

    /* ── Budget: KPI strip + donut summary + progress bar list ── */
    case 'budget':
      return (
        <div className={mockupWrapper}>
          {/* Header */}
          <div className="px-3 py-2 border-b flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Budget</span>
            <span className="text-[10px] text-muted-foreground ml-auto">Mai 2026</span>
          </div>
          {/* 3 KPI cards */}
          <div className="grid grid-cols-3 gap-1.5 p-3 border-b">
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowUpRight className="h-2.5 w-2.5 text-destructive" />
                <span className="text-[9px] text-muted-foreground">Réel</span>
              </div>
              <p className="font-bold text-[11px] text-destructive">2 406,95 €</p>
            </div>
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Clock className="h-2.5 w-2.5 text-primary" />
                <span className="text-[9px] text-muted-foreground">Projeté</span>
              </div>
              <p className="font-bold text-[11px]">125,43 €</p>
            </div>
            <div className="rounded-lg border p-2">
              <div className="flex items-center gap-1 mb-0.5">
                <Target className="h-2.5 w-2.5 text-success" />
                <span className="text-[9px] text-muted-foreground">Budget</span>
              </div>
              <p className="font-bold text-[11px]">2 725,00 €</p>
            </div>
          </div>
          {/* Progress bars per category */}
          <div className="px-3 py-2 space-y-2">
            <p className="text-[9px] text-muted-foreground uppercase tracking-wider">Catégories</p>
            {[
              { name: 'Shopping', pct: 84, breached: false, spent: '420 €', budget: '500 €' },
              { name: 'Loyer', pct: 100, breached: false, spent: '850 €', budget: '850 €' },
              { name: 'Sorties', pct: 130, breached: true, spent: '195 €', budget: '150 €' },
            ].map((row, i) => (
              <div key={i} className="rounded-lg border p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className={`h-1.5 w-1.5 rounded-full ${row.breached ? 'bg-destructive' : 'bg-success'}`} />
                    <span className="text-[10px] font-medium">{row.name}</span>
                    {row.breached && (
                      <span className="inline-flex items-center gap-0.5 text-[8px] px-1 py-0.5 rounded border border-destructive/40 text-destructive bg-destructive/10">
                        <AlertTriangle className="h-2 w-2" />
                        Dépassé
                      </span>
                    )}
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono">{row.pct}%</span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full ${row.breached ? 'bg-destructive' : row.pct >= 80 ? 'bg-warning' : 'bg-success'}`}
                    style={{ width: `${Math.min(100, row.pct)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-muted-foreground">
                  <span className="font-mono">{row.spent} / {row.budget}</span>
                  {row.breached
                    ? <span className="text-destructive font-medium">+45 € de dépassement</span>
                    : <span>80 € restants</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Tapez « budgets dépassés » dans ⌘K pour les voir partout</span>
          </div>
        </div>
      );

    /* ── Privacy & device: privacy toggle + export + PWA install + sync ── */
    case 'privacy':
      return (
        <div className={mockupWrapper}>
          {/* Privacy & data card */}
          <div className="px-3 py-2 border-b flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Confidentialité & données</span>
          </div>
          <div className="px-3 py-2 space-y-2 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <EyeOff className="h-3 w-3 text-muted-foreground" />
                <div>
                  <p className="text-[10px] font-medium">Mode privé</p>
                  <p className="text-[9px] text-muted-foreground">Floute montants & soldes</p>
                </div>
              </div>
              <div className="h-3.5 w-7 rounded-full bg-primary p-0.5">
                <div className="h-2.5 w-2.5 rounded-full bg-white ml-auto" />
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div>
                <p className="text-[10px] font-medium">Exporter les données</p>
                <p className="text-[9px] text-muted-foreground">Téléchargez vos transactions en CSV</p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded border inline-flex items-center gap-1">
                <Download className="h-2.5 w-2.5" />
                Exporter
              </span>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div>
                <p className="text-[10px] font-medium text-destructive">Supprimer le compte</p>
                <p className="text-[9px] text-muted-foreground">Suppression définitive</p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded border border-destructive/40 text-destructive">
                Demander
              </span>
            </div>
          </div>
          {/* Device & sync card */}
          <div className="px-3 py-2 border-b flex items-center gap-1.5">
            <Smartphone className="h-3.5 w-3.5 text-primary" />
            <span className="font-semibold">Appareil & synchro</span>
          </div>
          <div className="px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-[10px] font-medium">État de synchro</p>
                <p className="text-[9px] text-success inline-flex items-center gap-1">
                  <Wifi className="h-2.5 w-2.5" />
                  En ligne · toutes les modifications enregistrées
                </p>
              </div>
            </div>
            <div className="flex items-center justify-between border-t pt-2">
              <div>
                <p className="text-[10px] font-medium">Installer Spending Tracker</p>
                <p className="text-[9px] text-muted-foreground">Ajouter à l'écran d'accueil, hors-ligne</p>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded border">Installer…</span>
            </div>
          </div>
          <div className="px-3 py-2 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Toutes ces actions vivent dans Paramètres → Confidentialité & Appareil</span>
          </div>
        </div>
      );

    default:
      return null;
  }
};

// Icon + id only. All localised copy (title, description, steps, tips)
// lives in i18n under `onboarding.featureGuides.<id>` — see en.json /
// fr.json. The component composes the full guide list at render time
// via the `useGuideContent()` hook below so language toggles take
// effect immediately.
const GUIDE_META: { id: string; icon: typeof TrendingUp; route: string }[] = [
  { id: 'dashboard',     icon: TrendingUp,   route: '/' },
  { id: 'palette',       icon: Command,      route: '/' },
  { id: 'accounts',      icon: Wallet,       route: '/accounts' },
  { id: 'transactions',  icon: History,      route: '/transactions' },
  { id: 'budget',        icon: Target,       route: '/budget' },
  { id: 'savings',       icon: PiggyBank,    route: '/savings' },
  { id: 'debts',         icon: Scale,        route: '/scheduled?tab=loans' },
  { id: 'recurring',     icon: Receipt,      route: '/scheduled?tab=subscriptions' },
  { id: 'installments',  icon: CreditCard,   route: '/scheduled?tab=plans' },
  { id: 'reports',       icon: PieChart,     route: '/analyse' },
  { id: 'notifications', icon: Bell,         route: '/settings' },
  { id: 'privacy',       icon: ShieldCheck,  route: '/' },
  { id: 'settings',      icon: Settings,     route: '/settings' },
];


interface AccountDraft {
  name: string;
  bank: string;
  account_type: string;
  balance: string;
}

const Onboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const { createAccount, createCategory, accounts: existingAccounts, categories: existingCategories } = useFinancialData();
  const { updatePreferences } = useUserPreferences();

  // Compose the full guide list from `GUIDE_META` (icons + ids) and
  // i18n keys (title, description, steps, tips). Recomputes when the
  // user toggles language so the sheet content switches live.
  const featureGuides = useMemo(
    () =>
      GUIDE_META.map((meta) => {
        const steps = t(`onboarding.featureGuides.${meta.id}.steps`, {
          returnObjects: true,
          defaultValue: [],
        }) as unknown;
        const tips = t(`onboarding.featureGuides.${meta.id}.tips`, {
          returnObjects: true,
          defaultValue: [],
        }) as unknown;
        return {
          ...meta,
          title: t(`onboarding.featureGuides.${meta.id}.title`, { defaultValue: meta.id }),
          desc: t(`onboarding.featureGuides.${meta.id}.desc`, { defaultValue: '' }),
          steps: Array.isArray(steps) ? (steps as string[]) : [],
          tips: Array.isArray(tips) ? (tips as string[]) : [],
          route: meta.route,
        };
      }),
    // i18n.language is the actual signal — t() is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [i18n.language, t]
  );

  // Review mode: existing user revisiting the guide from settings
  const isReviewMode = existingAccounts.length > 0 || existingCategories.length > 0;

  const [currentStep, setCurrentStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selectedGuide, setSelectedGuide] = useState<string | null>(null);

  // Step 2: Accounts
  const [accounts, setAccounts] = useState<AccountDraft[]>([
    { name: '', bank: 'other', account_type: 'checking', balance: '0' }
  ]);

  // Step 3: Categories
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(
    new Set(defaultCategories.map((_, i) => i))
  );

  // Step 4: Currency
  const [currency, setCurrency] = useState('EUR');

  const progress = ((currentStep + 1) / TOTAL_STEPS) * 100;

  const addAccount = () => {
    setAccounts([...accounts, { name: '', bank: 'other', account_type: 'checking', balance: '0' }]);
  };

  const removeAccount = (index: number) => {
    if (accounts.length > 1) {
      setAccounts(accounts.filter((_, i) => i !== index));
    }
  };

  const updateAccount = (index: number, field: keyof AccountDraft, value: string) => {
    const updated = [...accounts];
    updated[index] = { ...updated[index], [field]: value };
    setAccounts(updated);
  };

  const toggleCategory = (index: number) => {
    const updated = new Set(selectedCategories);
    if (updated.has(index)) {
      updated.delete(index);
    } else {
      updated.add(index);
    }
    setSelectedCategories(updated);
  };

  const canProceed = () => {
    switch (currentStep) {
      case 0: return true; // Welcome
      case 1: return accounts.some(a => a.name.trim() !== ''); // At least one named account
      case 2: return selectedCategories.size > 0; // At least one category
      case 3: return true; // Currency
      case 4: return true; // Guide
      default: return true;
    }
  };

  const handleFinish = async () => {
    setLoading(true);
    try {
      if (!isReviewMode) {
        // 1. Create accounts (only for new users)
        for (const account of accounts) {
          if (account.name.trim()) {
            await createAccount({
              name: account.name.trim(),
              bank: account.bank as any,
              account_type: account.account_type as any,
              balance: parseFloat(account.balance) || 0,
            });
          }
        }

        // 2. Create selected categories (only for new users)
        for (const index of selectedCategories) {
          const cat = defaultCategories[index];
          await createCategory({
            name: cat.name,
            color: cat.color,
            budget: null,
            icon: null,
          });
        }

        // 3. Save currency preference
        updatePreferences({ currency });
      }

      // 4. Mark onboarding as done and clear signup flag
      localStorage.setItem('budget-app-onboarding-done', 'true');
      localStorage.removeItem('budget-app-needs-onboarding');

      toast({
        title: isReviewMode
          ? t('onboarding.toast.guideDoneTitle', { defaultValue: 'Guide complete!' })
          : t('onboarding.toast.setupDoneTitle', { defaultValue: 'Setup complete!' }),
        description: isReviewMode
          ? t('onboarding.toast.guideDoneDescription', { defaultValue: 'You can come back here from settings.' })
          : t('onboarding.toast.setupDoneDescription', { defaultValue: 'Your app is ready. Welcome!' }),
      });

      navigate('/', { replace: true });
    } catch (error) {
      toast({
        title: t('common.error', { defaultValue: 'Error' }),
        description: t('onboarding.toast.setupError', { defaultValue: 'An error occurred during setup.' }),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleFinish();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    if (currentStep < TOTAL_STEPS - 1) {
      // Skip this step, go to next
      setCurrentStep(currentStep + 1);
    } else {
      // Last step: finish the setup
      handleFinish();
    }
  };

  // Called from a guide sheet's "Go to page" button. Saves setup data
  // (same as handleFinish) then navigates directly to the feature's route
  // instead of the dashboard. In review mode just navigates immediately.
  const handleGoToPage = async (route: string) => {
    setLoading(true);
    try {
      if (!isReviewMode) {
        for (const account of accounts) {
          if (account.name.trim()) {
            await createAccount({
              name: account.name.trim(),
              bank: account.bank as any,
              account_type: account.account_type as any,
              balance: parseFloat(account.balance) || 0,
            });
          }
        }
        for (const index of selectedCategories) {
          const cat = defaultCategories[index];
          await createCategory({ name: cat.name, color: cat.color, budget: null, icon: null });
        }
        updatePreferences({ currency });
      }
      localStorage.setItem('budget-app-onboarding-done', 'true');
      localStorage.removeItem('budget-app-needs-onboarding');
      const [path, search] = route.split('?');
      navigate(`${path}${search ? `?${search}` : ''}`, { replace: true });
    } catch {
      toast({
        title: t('common.error', { defaultValue: 'Error' }),
        description: t('onboarding.toast.setupError', { defaultValue: 'An error occurred during setup.' }),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with progress */}
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                {t('onboarding.stepOf', {
                  current: currentStep + 1,
                  total: TOTAL_STEPS,
                  defaultValue: `Step ${currentStep + 1} / ${TOTAL_STEPS}`,
                })}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs text-muted-foreground">
              {t('onboarding.skip', { defaultValue: 'Skip' })}
            </Button>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-start justify-center px-4 sm:px-6 pb-8">
        <div className="w-full max-w-2xl">
          {/* Step 0: Welcome */}
          {currentStep === 0 && (
            <div className="text-center space-y-6 py-8">
              <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mx-auto">
                <Wallet className="h-10 w-10 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">
                  {t('onboarding.welcome.title', { defaultValue: 'Welcome to Banks Tracker' })}
                </h1>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
                  {t('onboarding.welcome.description', {
                    defaultValue: "Let's set up your app in a few simple steps so you can start managing your finances.",
                  })}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto pt-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-line">
                  <CreditCard className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('onboarding.welcome.accountsTitle', { defaultValue: 'Your accounts' })}</p>
                    <p className="text-xs text-muted-foreground">{t('onboarding.welcome.accountsDescription', { defaultValue: 'Add your bank accounts' })}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-line">
                  <Tag className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('onboarding.welcome.categoriesTitle', { defaultValue: 'Categories' })}</p>
                    <p className="text-xs text-muted-foreground">{t('onboarding.welcome.categoriesDescription', { defaultValue: 'Organize your spending' })}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-line">
                  <Wallet className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('onboarding.welcome.preferencesTitle', { defaultValue: 'Preferences' })}</p>
                    <p className="text-xs text-muted-foreground">{t('onboarding.welcome.preferencesDescription', { defaultValue: 'Currency and settings' })}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border border-line">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">{t('onboarding.welcome.guideTitle', { defaultValue: 'Guide' })}</p>
                    <p className="text-xs text-muted-foreground">{t('onboarding.welcome.guideDescription', { defaultValue: 'Discover the features' })}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Accounts */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <CreditCard className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {t('onboarding.accounts.title', { defaultValue: 'Add your accounts' })}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('onboarding.accounts.description', { defaultValue: 'Enter your bank accounts with their current balance' })}
                </p>
              </div>

              <div className="space-y-3">
                {accounts.map((account, index) => (
                  <div key={index} className="ft-card p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('onboarding.accounts.accountLabel', {
                          index: index + 1,
                          defaultValue: `Account ${index + 1}`,
                        })}
                      </span>
                      {accounts.length > 1 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeAccount(index)}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('onboarding.accounts.nameLabel', { defaultValue: 'Account name *' })}</Label>
                        <Input
                          placeholder={t('onboarding.accounts.namePlaceholder', { defaultValue: 'ex: Checking account' })}
                          value={account.name}
                          onChange={(e) => updateAccount(index, 'name', e.target.value)}
                          className="h-9 text-sm"
                        />
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('onboarding.accounts.bankLabel', { defaultValue: 'Bank' })}</Label>
                        <Select
                          value={account.bank}
                          onValueChange={(v) => updateAccount(index, 'bank', v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {bankOptions.map((b) => (
                              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('onboarding.accounts.typeLabel', { defaultValue: 'Type' })}</Label>
                        <Select
                          value={account.account_type}
                          onValueChange={(v) => updateAccount(index, 'account_type', v)}
                        >
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {accountTypes.map((accType) => (
                              <SelectItem key={accType.value} value={accType.value}>{accType.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">{t('onboarding.accounts.balanceLabel', { defaultValue: 'Current balance' })}</Label>
                        <AmountInput
                          placeholder="0.00"
                          value={account.balance}
                          onChange={(v) => updateAccount(index, 'balance', v)}
                          className="h-9 text-sm"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addAccount}
                className="w-full h-10 text-sm gap-2"
              >
                <Plus className="h-4 w-4" />
                {t('onboarding.accounts.addAccount', { defaultValue: 'Add an account' })}
              </Button>
            </div>
          )}

          {/* Step 2: Categories */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Tag className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {t('onboarding.categories.title', { defaultValue: 'Choose your categories' })}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('onboarding.categories.description', {
                    defaultValue: 'Select the categories you want to use. You can add more later.',
                  })}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
                {defaultCategories.map((cat, index) => {
                  const isSelected = selectedCategories.has(index);
                  return (
                    <button
                      key={index}
                      onClick={() => toggleCategory(index)}
                      className={`flex items-center gap-2.5 p-3 sm:p-4 rounded-xl border-2 transition-all text-left ${
                        isSelected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                      }`}
                    >
                      <div
                        className="h-4 w-4 rounded-full flex-shrink-0"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="text-xs sm:text-sm font-medium truncate">{cat.name}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-primary ml-auto flex-shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-center gap-2 pt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategories(new Set(defaultCategories.map((_, i) => i)))}
                  className="text-xs"
                >
                  {t('onboarding.categories.selectAll', { defaultValue: 'Select all' })}
                </Button>
                <span className="text-muted-foreground">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategories(new Set())}
                  className="text-xs"
                >
                  {t('onboarding.categories.deselectAll', { defaultValue: 'Deselect all' })}
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Currency */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <Wallet className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {t('onboarding.currency.title', { defaultValue: 'Your currency' })}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('onboarding.currency.description', {
                    defaultValue: 'Pick the main currency used to display your amounts',
                  })}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 max-w-md mx-auto">
                {currencyOptions.map((cur) => (
                  <button
                    key={cur.value}
                    onClick={() => setCurrency(cur.value)}
                    className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      currency === cur.value
                        ? 'border-primary bg-primary/5 shadow-sm'
                        : 'border-border hover:border-muted-foreground/30 hover:bg-muted/30'
                    }`}
                  >
                    <span className="text-2xl font-bold text-primary">{cur.symbol}</span>
                    <div className="text-left">
                      <p className="text-sm font-medium">{cur.label}</p>
                      <p className="text-xs text-muted-foreground">{cur.value}</p>
                    </div>
                    {currency === cur.value && (
                      <Check className="h-4 w-4 text-primary ml-auto" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Feature guide */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <h2 className="text-xl sm:text-2xl font-bold">
                  {t('onboarding.guide.title', { defaultValue: 'Discover the app' })}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t('onboarding.guide.description', {
                    defaultValue: 'Tap a feature to learn how to use it',
                  })}
                </p>
              </div>

              <div className="space-y-2.5">
                {featureGuides.map((feature, index) => (
                  <button
                    key={index}
                    type="button"
                    className="ft-card w-full text-left p-3 sm:p-4 flex items-start gap-3 cursor-pointer transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
                    onClick={() => setSelectedGuide(feature.id)}
                  >
                    <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <feature.icon className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{feature.title}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{feature.desc}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                  </button>
                ))}
              </div>

              {/* Feature detail sheet */}
              <Sheet open={!!selectedGuide} onOpenChange={(open) => !open && setSelectedGuide(null)}>
                <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl px-4 sm:px-6 pb-8">
                  {selectedGuide && (() => {
                    const guide = featureGuides.find(f => f.id === selectedGuide);
                    if (!guide) return null;
                    return (
                      <>
                        <SheetHeader className="text-left mb-5">
                          <div className="flex items-center gap-3 mb-1">
                            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                              <guide.icon className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                              <SheetTitle className="text-lg">{guide.title}</SheetTitle>
                              <SheetDescription>{guide.desc}</SheetDescription>
                            </div>
                          </div>
                        </SheetHeader>

                        <div className="space-y-5">
                          {/* Steps */}
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {t('onboarding.guide.howTo', { defaultValue: 'How to use it' })}
                            </p>
                            <div className="space-y-2.5">
                              {guide.steps.map((step, i) => (
                                <div key={i} className="flex items-start gap-3">
                                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                                  </div>
                                  <p className="text-sm leading-relaxed">{step}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* UI Mockup */}
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                              {t('onboarding.guide.preview', { defaultValue: 'Interface preview' })}
                            </p>
                            <FeatureMockup id={guide.id} />
                          </div>

                          {/* Tips */}
                          {guide.tips && (
                            <div className="space-y-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                {t('onboarding.guide.tips', { defaultValue: 'Tips' })}
                              </p>
                              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-2">
                                {guide.tips.map((tip, i) => (
                                  <div key={i} className="flex items-start gap-2 text-sm">
                                    <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
                                    <span className="text-sm leading-relaxed">{tip}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* CTA — navigate to the actual page */}
                        <SheetFooter className="pt-4 pb-2">
                          <Button
                            className="w-full gap-2"
                            onClick={() => handleGoToPage(guide.route)}
                            disabled={loading}
                          >
                            <ExternalLink className="h-4 w-4" />
                            {loading
                              ? t('onboarding.configuring', { defaultValue: 'Setting up...' })
                              : t('onboarding.guide.goToPage', { defaultValue: 'Open in app' })}
                          </Button>
                        </SheetFooter>
                      </>
                    );
                  })()}
                </SheetContent>
              </Sheet>
            </div>
          )}
        </div>
      </div>

      {/* Footer navigation */}
      <div className="sticky bottom-0 bg-background/80 backdrop-blur-lg border-t p-4 sm:p-6">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={handlePrev}
            disabled={currentStep === 0}
            className="gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="hidden sm:inline">{t('onboarding.previous', { defaultValue: 'Previous' })}</span>
          </Button>

          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === currentStep ? 'w-6 bg-primary' :
                  i < currentStep ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed() || loading}
            className="gap-1.5"
          >
            {loading ? (
              <span>{t('onboarding.configuring', { defaultValue: 'Setting up...' })}</span>
            ) : currentStep === TOTAL_STEPS - 1 ? (
              <>
                <span>{t('onboarding.start', { defaultValue: 'Get started' })}</span>
                <Sparkles className="h-4 w-4" />
              </>
            ) : (
              <>
                <span className="hidden sm:inline">{t('onboarding.next', { defaultValue: 'Next' })}</span>
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
