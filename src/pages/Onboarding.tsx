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
  ChevronDown, Eye, DollarSign, ListFilter, Target
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
    example: [
      { icon: Wallet, text: "Solde total : 3 250,00 \u20AC", highlight: true },
      { icon: TrendingUp, text: "Revenus ce mois : +2 800,00 \u20AC", highlight: false },
      { icon: ArrowLeftRight, text: "Depenses ce mois : -1 450,00 \u20AC", highlight: false },
      { icon: PieChart, text: "Top categorie : Alimentation (320 \u20AC)", highlight: false },
    ],
    tips: [
      "Le tableau de bord s'actualise automatiquement a chaque nouvelle transaction.",
      "Cliquez sur le graphique pour voir le detail d'un mois specifique."
    ]
  },
  {
    id: 'transactions',
    icon: ArrowLeftRight,
    title: "Transactions",
    desc: "Enregistrez revenus, depenses et virements entre comptes. Gerez les remboursements et les transactions exclues des stats.",
    steps: [
      "Appuyez sur le bouton '+' pour creer une nouvelle transaction.",
      "Choisissez le type : depense, revenu ou virement entre comptes.",
      "Renseignez le montant, la categorie, le compte et une description.",
      "Pour un virement, selectionnez le compte source et le compte destination.",
      "Retrouvez toutes vos transactions dans la liste avec filtres et recherche."
    ],
    example: [
      { icon: Tag, text: "Categorie : Alimentation", highlight: false },
      { icon: DollarSign, text: "Montant : -45,90 \u20AC", highlight: true },
      { icon: CreditCard, text: "Compte : Compte Courant", highlight: false },
      { icon: ListFilter, text: "Description : Courses Carrefour", highlight: false },
    ],
    tips: [
      "Utilisez les filtres pour retrouver rapidement une transaction par categorie, compte ou periode.",
      "Les virements entre comptes n'affectent pas votre solde global, seulement la repartition entre comptes.",
      "Vous pouvez exclure une transaction des statistiques si c'est un remboursement ou un cas particulier."
    ]
  },
  {
    id: 'recurring',
    icon: Repeat,
    title: "Recurrentes",
    desc: "Programmez vos depenses et revenus reguliers (loyer, salaire, abonnements...). Calendrier visuel des echeances.",
    steps: [
      "Ajoutez une transaction recurrente en precisant le montant et la frequence (mensuel, hebdomadaire...).",
      "Definissez la date de debut et eventuellement une date de fin.",
      "Consultez le calendrier pour visualiser toutes vos echeances a venir.",
      "Les transactions sont automatiquement creees aux dates prevues."
    ],
    example: [
      { icon: Repeat, text: "Loyer : -850,00 \u20AC / mois", highlight: true },
      { icon: Repeat, text: "Salaire : +2 800,00 \u20AC / mois", highlight: false },
      { icon: Repeat, text: "Netflix : -13,49 \u20AC / mois", highlight: false },
      { icon: Calendar, text: "Prochaine echeance : 1er du mois", highlight: false },
    ],
    tips: [
      "Configurez vos recurrentes des le depart pour avoir une vision precise de votre budget mensuel.",
      "Vous pouvez mettre en pause une recurrence sans la supprimer."
    ]
  },
  {
    id: 'installments',
    icon: Calendar,
    title: "Paiements echelonnes",
    desc: "Suivez vos credits et remboursements en cours avec progression et montants restants.",
    steps: [
      "Creez un paiement echelonne en indiquant le montant total et le nombre d'echeances.",
      "Renseignez la date de debut et la frequence des paiements.",
      "Suivez la progression avec la barre de completion et le montant restant.",
      "Chaque echeance est automatiquement comptabilisee dans vos transactions."
    ],
    example: [
      { icon: CreditCard, text: "Ordinateur portable : 1 200 \u20AC", highlight: true },
      { icon: Calendar, text: "4x sans frais : 300 \u20AC / mois", highlight: false },
      { icon: Check, text: "Progression : 2/4 echeances payees", highlight: false },
      { icon: Target, text: "Restant : 600 \u20AC", highlight: false },
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
      "Consultez le graphique de repartition par categorie en camembert.",
      "Analysez l'evolution de vos depenses et revenus avec le graphique en barres."
    ],
    example: [
      { icon: PieChart, text: "Repartition : 6 categories actives", highlight: true },
      { icon: TrendingUp, text: "Tendance : depenses en baisse de 12%", highlight: false },
      { icon: BarChart3, text: "Mois le plus depensier : Janvier", highlight: false },
      { icon: Eye, text: "Comparaison mois par mois disponible", highlight: false },
    ],
    tips: [
      "Comparez vos depenses d'un mois a l'autre pour identifier les tendances.",
      "Utilisez les rapports pour ajuster vos budgets mensuels."
    ]
  },
  {
    id: 'budgets',
    icon: BarChart3,
    title: "Budget par categorie",
    desc: "Definissez des limites de depenses mensuelles par categorie et suivez votre progression.",
    steps: [
      "Choisissez une categorie et definissez un plafond mensuel de depenses.",
      "Suivez en temps reel combien vous avez depense par rapport a votre budget.",
      "La barre de progression change de couleur selon votre consommation (vert, orange, rouge).",
      "Recevez des alertes visuelles quand vous approchez ou depassez votre limite."
    ],
    example: [
      { icon: Tag, text: "Alimentation : 350 \u20AC / 400 \u20AC", highlight: false },
      { icon: Tag, text: "Transport : 80 \u20AC / 150 \u20AC", highlight: false },
      { icon: Tag, text: "Loisirs : 195 \u20AC / 200 \u20AC", highlight: true },
      { icon: Target, text: "Budget global utilise a 72%", highlight: false },
    ],
    tips: [
      "Commencez par vos 3 plus grosses categories de depenses pour un budget efficace.",
      "Ajustez vos plafonds chaque mois en fonction de vos rapports du mois precedent."
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

                          {/* Visual example */}
                          <div className="space-y-3">
                            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exemple</p>
                            <div className="rounded-xl border bg-muted/30 p-4 space-y-2.5">
                              {guide.example.map((line, i) => (
                                <div key={i} className="flex items-center gap-2.5 text-sm">
                                  <line.icon className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                                  <span className={line.highlight ? "font-medium text-primary" : "text-muted-foreground"}>
                                    {line.text}
                                  </span>
                                </div>
                              ))}
                            </div>
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
