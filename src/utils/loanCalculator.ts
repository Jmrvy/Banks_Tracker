export interface LoanCalculation {
  monthlyPayment: number;
  totalInterest: number;
  totalAmount: number;
  schedule: PaymentScheduleItem[];
}

export interface PaymentScheduleItem {
  period: number;
  date: Date;
  payment: number;
  principal: number;
  interest: number;
  remainingBalance: number;
}

/**
 * Calculate amortizable loan (prêt amortissable)
 * Fixed payments with decreasing interest and increasing principal
 */
export const calculateAmortizableLoan = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  startDate: Date = new Date()
): LoanCalculation => {
  const monthlyRate = annualRate / 100 / 12;
  
  // Calculate fixed monthly payment
  const monthlyPayment = monthlyRate === 0 
    ? principal / durationMonths
    : (principal * monthlyRate * Math.pow(1 + monthlyRate, durationMonths)) / 
      (Math.pow(1 + monthlyRate, durationMonths) - 1);

  let remainingBalance = principal;
  const schedule: PaymentScheduleItem[] = [];
  let totalInterest = 0;

  for (let i = 1; i <= durationMonths; i++) {
    const interestPayment = remainingBalance * monthlyRate;
    const principalPayment = monthlyPayment - interestPayment;
    remainingBalance -= principalPayment;
    totalInterest += interestPayment;

    const paymentDate = new Date(startDate);
    paymentDate.setMonth(startDate.getMonth() + i);

    schedule.push({
      period: i,
      date: paymentDate,
      payment: monthlyPayment,
      principal: principalPayment,
      interest: interestPayment,
      remainingBalance: Math.max(0, remainingBalance)
    });
  }

  return {
    monthlyPayment,
    totalInterest,
    totalAmount: principal + totalInterest,
    schedule
  };
};

/**
 * Calculate bullet loan (prêt in fine)
 * Interest-only payments with principal repaid at the end
 */
export const calculateBulletLoan = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  startDate: Date = new Date()
): LoanCalculation => {
  const monthlyRate = annualRate / 100 / 12;
  const monthlyInterestPayment = principal * monthlyRate;
  const totalInterest = monthlyInterestPayment * durationMonths;

  const schedule: PaymentScheduleItem[] = [];

  for (let i = 1; i <= durationMonths; i++) {
    const paymentDate = new Date(startDate);
    paymentDate.setMonth(startDate.getMonth() + i);

    const isLastPayment = i === durationMonths;
    const payment = isLastPayment ? monthlyInterestPayment + principal : monthlyInterestPayment;
    const principalPayment = isLastPayment ? principal : 0;

    schedule.push({
      period: i,
      date: paymentDate,
      payment,
      principal: principalPayment,
      interest: monthlyInterestPayment,
      remainingBalance: isLastPayment ? 0 : principal
    });
  }

  return {
    monthlyPayment: monthlyInterestPayment,
    totalInterest,
    totalAmount: principal + totalInterest,
    schedule
  };
};

/**
 * Get payment frequency in months
 */
export const getFrequencyMonths = (frequency: string): number => {
  switch (frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'annual': return 12;
    default: return 1;
  }
};

/**
 * Calculate loan with custom frequency
 */
export const calculateLoanWithFrequency = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  frequency: string,
  loanType: 'amortizable' | 'bullet',
  startDate: Date = new Date()
): LoanCalculation => {
  const frequencyMonths = getFrequencyMonths(frequency);
  const numberOfPayments = Math.ceil(durationMonths / frequencyMonths);
  
  if (loanType === 'bullet') {
    return calculateBulletLoan(principal, annualRate, durationMonths, startDate);
  }

  const periodRate = (annualRate / 100) * (frequencyMonths / 12);
  
  const payment = periodRate === 0
    ? principal / numberOfPayments
    : (principal * periodRate * Math.pow(1 + periodRate, numberOfPayments)) / 
      (Math.pow(1 + periodRate, numberOfPayments) - 1);

  let remainingBalance = principal;
  const schedule: PaymentScheduleItem[] = [];
  let totalInterest = 0;

  for (let i = 1; i <= numberOfPayments; i++) {
    const interestPayment = remainingBalance * periodRate;
    const principalPayment = payment - interestPayment;
    remainingBalance -= principalPayment;
    totalInterest += interestPayment;

    const paymentDate = new Date(startDate);
    paymentDate.setMonth(startDate.getMonth() + (i * frequencyMonths));

    schedule.push({
      period: i,
      date: paymentDate,
      payment,
      principal: principalPayment,
      interest: interestPayment,
      remainingBalance: Math.max(0, remainingBalance)
    });
  }

  return {
    monthlyPayment: payment,
    totalInterest,
    totalAmount: principal + totalInterest,
    schedule
  };
};
