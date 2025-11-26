import { useState } from "react";
import { CreditCard, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useInstallmentPayments } from "@/hooks/useInstallmentPayments";
import { useFinancialData } from "@/hooks/useFinancialData";
import { useUserPreferences } from "@/hooks/useUserPreferences";
import { NewInstallmentPaymentModal } from "@/components/NewInstallmentPaymentModal";
import { RecordInstallmentPaymentModal } from "@/components/RecordInstallmentPaymentModal";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

const InstallmentPayments = () => {
  const { installmentPayments, loading } = useInstallmentPayments();
  const { accounts, categories } = useFinancialData();
  const { formatCurrency } = useUserPreferences();
  const [showNewModal, setShowNewModal] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<string | null>(null);

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'weekly': return 'Hebdomadaire';
      case 'monthly': return 'Mensuel';
      case 'quarterly': return 'Trimestriel';
      default: return frequency;
    }
  };

  const handleRecordPayment = (paymentId: string) => {
    setSelectedPayment(paymentId);
    setShowRecordModal(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="p-6 space-y-6 max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-primary" />
              Paiements en Plusieurs Fois
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gérez vos paiements échelonnés financés par votre épargne
            </p>
          </div>
          <Button onClick={() => setShowNewModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nouveau Paiement
          </Button>
        </div>

        {/* Installment Payments List */}
        {installmentPayments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <CreditCard className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Aucun paiement échelonné</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Créez votre premier paiement en plusieurs fois pour commencer
              </p>
              <Button onClick={() => setShowNewModal(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Créer un paiement
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {installmentPayments.map((payment) => {
              const account = accounts.find(a => a.id === payment.account_id);
              const category = categories.find(c => c.id === payment.category_id);
              const progress = ((payment.total_amount - payment.remaining_amount) / payment.total_amount) * 100;

              return (
                <Card key={payment.id} className="hover:bg-accent/50 transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{payment.description}</CardTitle>
                      <Badge variant={payment.is_active ? "default" : "secondary"}>
                        {payment.is_active ? "Actif" : "Terminé"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Progression</span>
                        <span className="font-medium">{progress.toFixed(0)}%</span>
                      </div>
                      <Progress value={progress} className="h-2" />
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total:</span>
                        <span className="font-medium">{formatCurrency(payment.total_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Restant:</span>
                        <span className="font-medium text-primary">{formatCurrency(payment.remaining_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Mensualité:</span>
                        <span className="font-medium">{formatCurrency(payment.installment_amount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Fréquence:</span>
                        <span>{getFrequencyLabel(payment.frequency)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Prochain paiement:</span>
                        <span>{format(new Date(payment.next_payment_date), 'dd MMM yyyy', { locale: fr })}</span>
                      </div>
                      {account && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Compte:</span>
                          <span>{account.name}</span>
                        </div>
                      )}
                      {category && (
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Catégorie:</span>
                          <Badge variant="outline" className="gap-1">
                            <div 
                              className="w-2 h-2 rounded-full" 
                              style={{ backgroundColor: category.color }}
                            />
                            {category.name}
                          </Badge>
                        </div>
                      )}
                    </div>

                    {payment.is_active && (
                      <Button 
                        onClick={() => handleRecordPayment(payment.id)} 
                        className="w-full"
                        size="sm"
                      >
                        Enregistrer un paiement
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <NewInstallmentPaymentModal 
        open={showNewModal} 
        onOpenChange={setShowNewModal} 
      />
      
      {selectedPayment && (
        <RecordInstallmentPaymentModal 
          open={showRecordModal} 
          onOpenChange={setShowRecordModal}
          installmentPaymentId={selectedPayment}
        />
      )}
    </div>
  );
};

export default InstallmentPayments;