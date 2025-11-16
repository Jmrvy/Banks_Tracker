import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { LoanCalculation } from '@/utils/loanCalculator';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface AmortizationScheduleProps {
  calculation: LoanCalculation;
}

export const AmortizationSchedule = ({ calculation }: AmortizationScheduleProps) => {
  const { formatCurrency } = useUserPreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Plan d'amortissement</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">N°</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Paiement</TableHead>
                <TableHead className="text-right">Capital</TableHead>
                <TableHead className="text-right">Intérêts</TableHead>
                <TableHead className="text-right">Restant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {calculation.schedule.map((item) => (
                <TableRow key={item.period}>
                  <TableCell className="font-medium">{item.period}</TableCell>
                  <TableCell>{format(item.date, 'MMM yyyy', { locale: fr })}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(item.payment)}
                  </TableCell>
                  <TableCell className="text-right text-success">
                    {formatCurrency(item.principal)}
                  </TableCell>
                  <TableCell className="text-right text-warning">
                    {formatCurrency(item.interest)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {formatCurrency(item.remainingBalance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};
