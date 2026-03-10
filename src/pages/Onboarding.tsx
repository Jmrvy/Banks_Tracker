import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  Bell, Mail, FileText, Settings, Filter, Pause,
  ArrowUpRight, ArrowDownRight, MousePointerClick
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";

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

const defaultCategories = [
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
  const mockupHeader = "flex items-center justify-between px-3 py-2 border-b bg-muted/40";
  const mockupRow = "flex items-center justify-between px-3 py-2 border-b last:border-0";

  switch (id) {
    case 'dashboard':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Tableau de bord</span>
            <span className="text-muted-foreground">Mars 2026</span>
          </div>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-px bg-border">
            <div className="bg-card p-2.5 text-center">
              <p className="text-muted-foreground text-[10px]">Solde total</p>
              <p className="font-bold text-sm text-primary">3 250 €</p>
            </div>
            <div className="bg-card p-2.5 text-center">
              <p className="text-muted-foreground text-[10px]">Revenus</p>
              <p className="font-bold text-sm text-emerald-500">+2 800 €</p>
            </div>
            <div className="bg-card p-2.5 text-center">
              <p className="text-muted-foreground text-[10px]">Depenses</p>
              <p className="font-bold text-sm text-red-500">-1 450 €</p>
            </div>
          </div>
          {/* Mini chart mockup */}
          <div className="p-3 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Evolution du solde</p>
            <div className="flex items-end gap-1 h-10">
              {[40, 55, 45, 60, 50, 70, 65, 80, 75, 85, 78, 90].map((h, i) => (
                <div key={i} className="flex-1 rounded-sm bg-primary/20" style={{ height: `${h}%` }}>
                  <div className="w-full rounded-sm bg-primary" style={{ height: '60%', marginTop: 'auto' }} />
                </div>
              ))}
            </div>
          </div>
          {/* Annotation */}
          <div className="px-3 pb-2.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez sur les stats pour voir le detail des transactions</span>
          </div>
        </div>
      );

    case 'accounts':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Mes comptes</span>
            <div className="h-5 w-5 rounded-md bg-primary/10 flex items-center justify-center">
              <Plus className="h-3 w-3 text-primary" />
            </div>
          </div>
          {[
            { name: 'Compte Courant', bank: 'Societe Generale', amount: '2 150,00 €', color: 'text-foreground' },
            { name: 'Livret A', bank: 'Boursorama', amount: '8 500,00 €', color: 'text-foreground' },
            { name: 'Revolut', bank: 'Revolut', amount: '320,00 €', color: 'text-foreground' },
          ].map((acc, i) => (
            <div key={i} className={mockupRow}>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Wallet className="h-3 w-3 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-[11px]">{acc.name}</p>
                  <p className="text-[10px] text-muted-foreground">{acc.bank}</p>
                </div>
              </div>
              <span className={`font-semibold text-[11px] ${acc.color}`}>{acc.amount}</span>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez sur un compte pour voir ses transactions</span>
          </div>
        </div>
      );

    case 'transactions':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Transactions</span>
            <div className="flex gap-1.5">
              <div className="h-5 px-2 rounded-md bg-muted flex items-center gap-1">
                <Filter className="h-2.5 w-2.5" />
                <span className="text-[10px]">Filtres</span>
              </div>
              <div className="h-5 w-5 rounded-md bg-primary flex items-center justify-center">
                <Plus className="h-3 w-3 text-primary-foreground" />
              </div>
            </div>
          </div>
          {/* Type selector */}
          <div className="px-3 pt-2 pb-1 flex gap-1.5">
            {['Depense', 'Revenu', 'Virement'].map((type, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {type}
              </span>
            ))}
          </div>
          {[
            { desc: 'Courses Carrefour', cat: 'Alimentation', amount: '-45,90 €', amountColor: 'text-red-500', icon: ArrowDownRight },
            { desc: 'Salaire Mars', cat: 'Salaire', amount: '+2 800,00 €', amountColor: 'text-emerald-500', icon: ArrowUpRight },
            { desc: 'Vers Livret A', cat: 'Virement', amount: '-500,00 €', amountColor: 'text-blue-500', icon: ArrowLeftRight },
          ].map((tx, i) => (
            <div key={i} className={mockupRow}>
              <div className="flex items-center gap-2">
                <div className={`h-6 w-6 rounded-lg flex items-center justify-center ${i === 2 ? 'bg-blue-500/10' : i === 1 ? 'bg-emerald-500/10' : 'bg-red-500/10'}`}>
                  <tx.icon className={`h-3 w-3 ${i === 2 ? 'text-blue-500' : i === 1 ? 'text-emerald-500' : 'text-red-500'}`} />
                </div>
                <div>
                  <p className="font-medium text-[11px]">{tx.desc}</p>
                  <p className="text-[10px] text-muted-foreground">{tx.cat}</p>
                </div>
              </div>
              <span className={`font-semibold text-[11px] ${tx.amountColor}`}>{tx.amount}</span>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Appuyez sur + pour ajouter, choisissez le type en haut</span>
          </div>
        </div>
      );

    case 'savings':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Epargne</span>
            <span className="text-muted-foreground">3 objectifs</span>
          </div>
          <div className="px-3 py-2 bg-primary/5 border-b flex items-center gap-1.5">
            <Tag className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Basee sur vos transactions categoriees en investissement</span>
          </div>
          {[
            { name: 'Vacances ete', current: 1200, target: 2000, pct: 60 },
            { name: 'Fonds urgence', current: 4500, target: 5000, pct: 90 },
          ].map((goal, i) => (
            <div key={i} className="px-3 py-2.5 border-b space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <PiggyBank className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-[11px]">{goal.name}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{goal.current.toLocaleString()} / {goal.target.toLocaleString()} €</span>
              </div>
              <Progress value={goal.pct} className="h-1.5" />
              <p className="text-[10px] text-muted-foreground">
                {goal.pct >= 90 ? 'Presque atteint !' : `Estimation : ${Math.ceil((goal.target - goal.current) / 200)} mois restants`}
              </p>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Creez un objectif et suivez la projection automatique</span>
          </div>
        </div>
      );

    case 'debts':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Dettes</span>
            <span className="text-[10px] text-emerald-500 font-medium">Position : +70 €</span>
          </div>
          {/* Tabs */}
          <div className="px-3 pt-2 pb-1 flex gap-1.5">
            {['Tous', 'Prets donnes', 'Prets recus'].map((tab, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {tab}
              </span>
            ))}
          </div>
          {[
            { person: 'Pierre', type: 'Pret donne', amount: '+150,00 €', color: 'text-emerald-500' },
            { person: 'Marie', type: 'Pret recu', amount: '-80,00 €', color: 'text-red-500' },
          ].map((debt, i) => (
            <div key={i} className={mockupRow}>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                  <span className="text-[10px] font-bold">{debt.person[0]}</span>
                </div>
                <div>
                  <p className="font-medium text-[11px]">{debt.person}</p>
                  <p className="text-[10px] text-muted-foreground">{debt.type}</p>
                </div>
              </div>
              <span className={`font-semibold text-[11px] ${debt.color}`}>{debt.amount}</span>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Enregistrez les remboursements partiels au fur et a mesure</span>
          </div>
        </div>
      );

    case 'recurring':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Recurrentes</span>
            <div className="flex gap-1.5">
              <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded">Calendrier</span>
              <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">Liste</span>
            </div>
          </div>
          {[
            { name: 'Loyer', freq: 'Mensuel · 1er', amount: '-850,00 €', color: 'text-red-500', active: true },
            { name: 'Salaire', freq: 'Mensuel · 28', amount: '+2 800,00 €', color: 'text-emerald-500', active: true },
            { name: 'Netflix', freq: 'Mensuel · 15', amount: '-13,49 €', color: 'text-red-500', active: false },
          ].map((rec, i) => (
            <div key={i} className={mockupRow}>
              <div className="flex items-center gap-2">
                <div className="h-6 w-6 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Repeat className="h-3 w-3 text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-medium text-[11px]">{rec.name}</p>
                    {!rec.active && <Pause className="h-2.5 w-2.5 text-muted-foreground" />}
                  </div>
                  <p className="text-[10px] text-muted-foreground">{rec.freq}</p>
                </div>
              </div>
              <span className={`font-semibold text-[11px] ${rec.color}`}>{rec.amount}</span>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Mettez en pause ou executez en avance depuis la liste</span>
          </div>
        </div>
      );

    case 'installments':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Paiements echelonnes</span>
            <span className="text-muted-foreground">2 en cours</span>
          </div>
          {[
            { name: 'Ordinateur portable', total: '1 200 €', paid: 2, of: 4, pct: 50, remaining: '600 €' },
            { name: 'Canape', total: '900 €', paid: 5, of: 10, pct: 50, remaining: '450 €' },
          ].map((inst, i) => (
            <div key={i} className="px-3 py-2.5 border-b space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-3.5 w-3.5 text-primary" />
                  <span className="font-medium text-[11px]">{inst.name}</span>
                </div>
                <span className="text-[10px] font-semibold">{inst.total}</span>
              </div>
              <Progress value={inst.pct} className="h-1.5" />
              <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span>{inst.paid}/{inst.of} echeances</span>
                <span>Restant : {inst.remaining}</span>
              </div>
            </div>
          ))}
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Cliquez pour enregistrer un paiement ou voir l'historique</span>
          </div>
        </div>
      );

    case 'reports':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Rapports</span>
            <span className="text-muted-foreground">Fevrier 2026</span>
          </div>
          {/* Tabs */}
          <div className="px-3 pt-2 pb-1 flex gap-1.5">
            {['Evolution', 'Revenus', 'Depenses', 'Recurrentes'].map((tab, i) => (
              <span key={i} className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${i === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                {tab}
              </span>
            ))}
          </div>
          {/* Mini bar chart */}
          <div className="px-3 py-3 space-y-2">
            {[
              { cat: 'Alimentation', pct: 35, amount: '320 €', color: 'bg-emerald-500' },
              { cat: 'Transport', pct: 20, amount: '180 €', color: 'bg-blue-500' },
              { cat: 'Logement', pct: 55, amount: '850 €', color: 'bg-violet-500' },
              { cat: 'Loisirs', pct: 12, amount: '95 €', color: 'bg-amber-500' },
            ].map((row, i) => (
              <div key={i} className="space-y-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium">{row.cat}</span>
                  <span className="text-[10px] text-muted-foreground">{row.amount}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${row.color}`} style={{ width: `${row.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="px-3 pb-2.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Changez d'onglet et de periode pour analyser vos finances</span>
          </div>
        </div>
      );

    case 'notifications':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Notifications email</span>
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {/* Settings toggles mockup */}
          <div className="px-3 py-2.5 border-b space-y-2.5">
            {[
              { label: 'Alertes de budget', desc: 'Email quand un budget est depasse', on: true },
              { label: 'Rapports mensuels', desc: 'Resume financier chaque debut de mois', on: true },
            ].map((toggle, i) => (
              <div key={i} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-[11px]">{toggle.label}</p>
                  <p className="text-[10px] text-muted-foreground">{toggle.desc}</p>
                </div>
                <div className={`w-8 h-4.5 rounded-full flex items-center px-0.5 ${toggle.on ? 'bg-primary justify-end' : 'bg-muted justify-start'}`}>
                  <div className="w-3.5 h-3.5 rounded-full bg-white shadow-sm" />
                </div>
              </div>
            ))}
          </div>
          {/* Email preview */}
          <div className="px-3 py-2.5 space-y-1.5">
            <p className="text-[10px] font-medium text-muted-foreground">Exemple de mail recu</p>
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold">Alerte : Budget Alimentation depasse</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Vous avez depense 420 € sur un budget de 400 €. Depassement de 20 €.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-2 space-y-1">
              <div className="flex items-center gap-1.5">
                <FileText className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-semibold">Rapport mensuel · Fevrier 2026</span>
              </div>
              <p className="text-[10px] text-muted-foreground">Revenus : 2 800 € · Depenses : 1 450 € · PDF en piece jointe</p>
            </div>
          </div>
          <div className="px-3 pb-2.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Activez dans Parametres → Notifications par Email</span>
          </div>
        </div>
      );

    case 'settings':
      return (
        <div className={mockupWrapper}>
          <div className={mockupHeader}>
            <span className="font-semibold">Parametres</span>
            <Settings className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          {[
            { icon: DollarSign, label: 'Preferences', desc: 'Devise, compte par defaut, alias' },
            { icon: Bell, label: 'Notifications', desc: 'Alertes budget, rapports mensuels' },
            { icon: Wallet, label: 'Comptes', desc: 'Ajouter, modifier, supprimer' },
            { icon: Tag, label: 'Categories', desc: 'Personnaliser noms et couleurs' },
            { icon: BookOpen, label: 'Guide', desc: 'Revoir la presentation' },
          ].map((item, i) => (
            <div key={i} className={mockupRow}>
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
          <div className="px-3 pb-2.5 pt-1.5 flex items-center gap-1.5">
            <MousePointerClick className="h-3 w-3 text-primary" />
            <span className="text-[10px] text-primary font-medium">Tout se configure ici, accessible depuis le menu</span>
          </div>
        </div>
      );

    default:
      return null;
  }
};

const featureGuides = [
  {
    id: 'dashboard',
    icon: TrendingUp,
    title: "Tableau de bord",
    desc: "Vue d'ensemble avec solde total, revenus et depenses du mois, graphiques d'evolution et repartition par categorie.",
    steps: [
      "Consultez votre solde total en haut de la page d'accueil, mis a jour en temps reel.",
      "Visualisez vos revenus et depenses du mois en cours avec les indicateurs colores.",
      "Explorez le graphique d'evolution pour suivre vos finances sur plusieurs mois.",
      "Consultez la repartition par categorie pour identifier vos principaux postes de depenses."
    ],
    tips: [
      "Le tableau de bord s'actualise automatiquement a chaque nouvelle transaction.",
      "Cliquez sur le graphique pour voir le detail d'un mois specifique."
    ]
  },
  {
    id: 'accounts',
    icon: Wallet,
    title: "Comptes",
    desc: "Gerez tous vos comptes bancaires, consultez les soldes individuels et l'historique par compte.",
    steps: [
      "Retrouvez tous vos comptes bancaires avec leur solde respectif sur la page Comptes.",
      "Cliquez sur un compte pour voir son detail et l'historique de ses transactions.",
      "Ajoutez un nouveau compte a tout moment via le bouton '+' en haut de la page.",
      "Modifiez le nom, la banque ou le type d'un compte depuis ses parametres."
    ],
    tips: [
      "Vous pouvez definir des alias pour vos comptes dans les parametres pour un affichage plus court.",
      "Le solde de chaque compte est automatiquement mis a jour a chaque transaction."
    ]
  },
  {
    id: 'transactions',
    icon: History,
    title: "Transactions",
    desc: "Enregistrez revenus, depenses et virements entre comptes. Filtrez et recherchez dans votre historique.",
    steps: [
      "Appuyez sur le bouton '+' pour creer une nouvelle transaction.",
      "Choisissez le type : depense, revenu ou virement entre comptes.",
      "Renseignez le montant, la categorie, le compte et une description.",
      "Pour un virement, selectionnez le compte source et le compte destination.",
      "Retrouvez toutes vos transactions dans la liste avec filtres et recherche."
    ],
    tips: [
      "Utilisez les filtres pour retrouver rapidement une transaction par categorie, compte ou periode.",
      "Les virements entre comptes n'affectent pas votre solde global, seulement la repartition entre comptes.",
      "Vous pouvez exclure une transaction des statistiques si c'est un remboursement ou un cas particulier."
    ]
  },
  {
    id: 'savings',
    icon: PiggyBank,
    title: "Epargne",
    desc: "Suivez votre epargne basee sur toutes les transactions categoriees en investissement, avec objectifs et projections.",
    steps: [
      "Toutes les transactions (depenses et revenus) avec une categorie de type investissement sont automatiquement comptabilisees dans l'onglet Epargne.",
      "Consultez vos statistiques d'epargne : epargne nette, depots, retraits et remboursements.",
      "Creez des objectifs d'epargne en indiquant le nom et le montant cible.",
      "Suivez la progression de chaque objectif et les projections (mois restants, montant mensuel necessaire)."
    ],
    tips: [
      "Pour qu'une transaction apparaisse ici, il suffit de lui attribuer une categorie de type investissement (ex: Epargne, Investissement).",
      "Les revenus en categorie investissement sont comptabilises comme depots, les depenses comme retraits.",
      "Definissez des objectifs realistes bases sur votre epargne mensuelle moyenne visible dans les rapports."
    ]
  },
  {
    id: 'debts',
    icon: Scale,
    title: "Dettes",
    desc: "Suivez les prets donnes et recus, gerez les remboursements et visualisez votre position nette.",
    steps: [
      "Ajoutez une dette en precisant s'il s'agit d'un pret donne ou recu.",
      "Renseignez le montant, la personne concernee et une description.",
      "Enregistrez les remboursements partiels au fur et a mesure.",
      "Consultez votre position nette : total prete vs total du."
    ],
    tips: [
      "Filtrez par onglet (tous, prets donnes, prets recus) pour une vue ciblee.",
      "Chaque remboursement est lie automatiquement a la dette correspondante."
    ]
  },
  {
    id: 'recurring',
    icon: Receipt,
    title: "Recurrentes",
    desc: "Programmez vos depenses et revenus reguliers (loyer, salaire, abonnements...). Calendrier visuel des echeances.",
    steps: [
      "Ajoutez une transaction recurrente en precisant le montant et la frequence (mensuel, hebdomadaire...).",
      "Definissez la date de debut et eventuellement une date de fin.",
      "Consultez le calendrier pour visualiser toutes vos echeances a venir.",
      "Mettez en pause ou executez en avance une recurrence selon vos besoins."
    ],
    tips: [
      "Configurez vos recurrentes des le depart pour avoir une vision precise de votre budget mensuel.",
      "Vous pouvez mettre en pause une recurrence sans la supprimer, et l'executer en avance si besoin."
    ]
  },
  {
    id: 'installments',
    icon: CreditCard,
    title: "Paiements echelonnes",
    desc: "Suivez vos achats en plusieurs fois et credits en cours avec progression et montants restants.",
    steps: [
      "Creez un paiement echelonne en indiquant le montant total et le nombre d'echeances.",
      "Renseignez la date de debut et la frequence des paiements.",
      "Suivez la progression avec la barre de completion et le montant restant.",
      "Chaque echeance est automatiquement comptabilisee dans vos transactions."
    ],
    tips: [
      "Ideal pour suivre les achats en plusieurs fois ou les credits en cours.",
      "La barre de progression vous montre en un coup d'oeil ou vous en etes."
    ]
  },
  {
    id: 'reports',
    icon: PieChart,
    title: "Rapports",
    desc: "Analyses detaillees de vos finances : tendances, repartition, evolution dans le temps.",
    steps: [
      "Accedez a la page Rapports depuis le menu de navigation.",
      "Selectionnez la periode d'analyse souhaitee (mois, trimestre, annee).",
      "Explorez les 4 onglets : Evolution, Revenus, Depenses et Recurrentes.",
      "Exportez vos rapports pour les conserver ou les partager."
    ],
    tips: [
      "Comparez vos depenses d'un mois a l'autre pour identifier les tendances.",
      "Utilisez les rapports pour ajuster vos habitudes de depenses."
    ]
  },
  {
    id: 'notifications',
    icon: Bell,
    title: "Notifications par email",
    desc: "Recevez des alertes de depassement de budget et un rapport financier mensuel par email.",
    steps: [
      "Activez les notifications dans Parametres > Notifications par Email.",
      "Activez les alertes de budget pour etre prevenu quand une categorie depasse son plafond.",
      "Activez les rapports mensuels pour recevoir un resume financier complet chaque debut de mois.",
      "Le rapport mensuel inclut un PDF avec vos revenus, depenses, repartition par categorie et evolution."
    ],
    tips: [
      "Les alertes de budget sont envoyees une seule fois par categorie par mois pour eviter le spam.",
      "Le rapport mensuel compare automatiquement avec le mois precedent pour identifier les tendances.",
      "Definissez d'abord des budgets par categorie dans vos comptes pour que les alertes fonctionnent."
    ]
  },
  {
    id: 'settings',
    icon: Settings,
    title: "Parametres",
    desc: "Personnalisez l'application : devise, comptes, categories, notifications et preferences.",
    steps: [
      "Modifiez votre devise et votre compte par defaut dans les preferences.",
      "Gerez vos comptes bancaires : ajoutez, modifiez ou supprimez des comptes.",
      "Personnalisez vos categories de depenses et revenus avec des couleurs.",
      "Configurez vos notifications email (alertes budget et rapports mensuels).",
      "Relisez le guide de l'application a tout moment depuis cette page."
    ],
    tips: [
      "Definir un compte par defaut accelere la saisie de vos transactions.",
      "Vous pouvez creer des alias pour vos comptes afin d'avoir des noms plus courts dans l'app."
    ]
  },
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
  const { createAccount, createCategory, accounts: existingAccounts, categories: existingCategories } = useFinancialData();
  const { updatePreferences } = useUserPreferences();

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
          });
        }

        // 3. Save currency preference
        updatePreferences({ currency });
      }

      // 4. Mark onboarding as done and clear signup flag
      localStorage.setItem('budget-app-onboarding-done', 'true');
      localStorage.removeItem('budget-app-needs-onboarding');

      toast({
        title: isReviewMode ? "Guide termine !" : "Configuration terminee !",
        description: isReviewMode ? "Vous pouvez revenir ici depuis les parametres." : "Votre application est prete. Bienvenue !",
      });

      navigate('/', { replace: true });
    } catch (error) {
      toast({
        title: "Erreur",
        description: "Une erreur est survenue lors de la configuration.",
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex flex-col">
      {/* Header with progress */}
      <div className="p-4 sm:p-6">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="text-sm font-medium text-muted-foreground">
                Etape {currentStep + 1} / {TOTAL_STEPS}
              </span>
            </div>
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-xs text-muted-foreground">
              Passer
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
                <h1 className="text-2xl sm:text-3xl font-bold mb-2">Bienvenue sur Banks Tracker</h1>
                <p className="text-muted-foreground text-sm sm:text-base max-w-md mx-auto">
                  Configurons ensemble votre application en quelques etapes simples pour que vous puissiez commencer a gerer vos finances.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-lg mx-auto pt-4">
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                  <CreditCard className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Vos comptes</p>
                    <p className="text-xs text-muted-foreground">Ajoutez vos comptes bancaires</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                  <Tag className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Categories</p>
                    <p className="text-xs text-muted-foreground">Organisez vos depenses</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                  <Wallet className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Preferences</p>
                    <p className="text-xs text-muted-foreground">Devise et parametres</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg bg-card border">
                  <BookOpen className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Guide</p>
                    <p className="text-xs text-muted-foreground">Decouvrez les fonctionnalites</p>
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
                <h2 className="text-xl sm:text-2xl font-bold">Ajoutez vos comptes</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Renseignez vos comptes bancaires avec leur solde actuel
                </p>
              </div>

              <div className="space-y-3">
                {accounts.map((account, index) => (
                  <Card key={index} className="border shadow-sm">
                    <CardContent className="p-3 sm:p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Compte {index + 1}</span>
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
                          <Label className="text-xs">Nom du compte *</Label>
                          <Input
                            placeholder="ex: Compte Courant"
                            value={account.name}
                            onChange={(e) => updateAccount(index, 'name', e.target.value)}
                            className="h-9 text-sm"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Banque</Label>
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
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={account.account_type}
                            onValueChange={(v) => updateAccount(index, 'account_type', v)}
                          >
                            <SelectTrigger className="h-9 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {accountTypes.map((t) => (
                                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-xs">Solde actuel</Label>
                          <AmountInput
                            placeholder="0.00"
                            value={account.balance}
                            onChange={(v) => updateAccount(index, 'balance', v)}
                            className="h-9 text-sm"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Button
                variant="outline"
                onClick={addAccount}
                className="w-full h-10 text-sm gap-2"
              >
                <Plus className="h-4 w-4" />
                Ajouter un compte
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
                <h2 className="text-xl sm:text-2xl font-bold">Choisissez vos categories</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Selectionnez les categories que vous souhaitez utiliser. Vous pourrez en ajouter d'autres plus tard.
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
                  Tout selectionner
                </Button>
                <span className="text-muted-foreground">|</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCategories(new Set())}
                  className="text-xs"
                >
                  Tout deselectionner
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
                <h2 className="text-xl sm:text-2xl font-bold">Votre devise</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Choisissez la devise principale pour l'affichage de vos montants
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
                <h2 className="text-xl sm:text-2xl font-bold">Decouvrez l'application</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Cliquez sur une fonctionnalite pour decouvrir comment l'utiliser
                </p>
              </div>

              <div className="space-y-2.5">
                {featureGuides.map((feature, index) => (
                  <Card
                    key={index}
                    className="border shadow-sm cursor-pointer transition-all hover:border-primary/40 hover:shadow-md active:scale-[0.98]"
                    onClick={() => setSelectedGuide(feature.id)}
                  >
                    <CardContent className="p-3 sm:p-4 flex items-start gap-3">
                      <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <feature.icon className="h-4.5 w-4.5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{feature.title}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{feature.desc}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
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
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comment faire</p>
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
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Apercu de l'interface</p>
                            <FeatureMockup id={guide.id} />
                          </div>

                          {/* Tips */}
                          {guide.tips && (
                            <div className="space-y-2.5">
                              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Astuces</p>
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
            <span className="hidden sm:inline">Precedent</span>
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
              <span>Configuration...</span>
            ) : currentStep === TOTAL_STEPS - 1 ? (
              <>
                <span>Commencer</span>
                <Sparkles className="h-4 w-4" />
              </>
            ) : (
              <>
                <span className="hidden sm:inline">Suivant</span>
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
