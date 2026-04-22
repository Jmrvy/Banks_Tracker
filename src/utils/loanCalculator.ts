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

const safeAddMonths = (base: Date, months: number): Date => {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const d = base.getDate();
  const result = new Date(y, m, d);
  if (result.getDate() !== d) {
    return new Date(y, m + 1, 0);
  }
  return result;
};

const roundCents = (n: number): number => Math.round(n * 100) / 100;

const calculateAmortizableLoan = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  startDate: Date = new Date()
): LoanCalculation => {
  if (durationMonths <= 0) {
    return { monthlyPayment: 0, totalInterest: 0, totalAmount: principal, schedule: [] };
  }

  const monthlyRate = annualRate / 100 / 12;

  const monthlyPayment = monthlyRate === 0
    ? principal / durationMonths
    : (principal * monthlyRate * Math.pow(1 + monthlyRate, durationMonths)) /
      (Math.pow(1 + monthlyRate, durationMonths) - 1);

  let remainingBalance = principal;
  const schedule: PaymentScheduleItem[] = [];
  let totalInterest = 0;

  for (let i = 1; i <= durationMonths; i++) {
    const interestPayment = roundCents(remainingBalance * monthlyRate);
    const isLast = i === durationMonths;
    const principalPayment = isLast ? remainingBalance : roundCents(monthlyPayment - interestPayment);
    const actualPayment = isLast ? principalPayment + interestPayment : monthlyPayment;
    remainingBalance = isLast ? 0 : roundCents(remainingBalance - principalPayment);
    totalInterest += interestPayment;

    schedule.push({
      period: i,
      date: safeAddMonths(startDate, i),
      payment: roundCents(actualPayment),
      principal: principalPayment,
      interest: interestPayment,
      remainingBalance: Math.max(0, remainingBalance)
    });
  }

  return {
    monthlyPayment: roundCents(monthlyPayment),
    totalInterest: roundCents(totalInterest),
    totalAmount: roundCents(principal + totalInterest),
    schedule
  };
};

const calculateBulletLoan = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  startDate: Date = new Date()
): LoanCalculation => {
  if (durationMonths <= 0) {
    return { monthlyPayment: 0, totalInterest: 0, totalAmount: principal, schedule: [] };
  }

  const monthlyRate = annualRate / 100 / 12;
  const monthlyInterestPayment = roundCents(principal * monthlyRate);
  const totalInterest = roundCents(monthlyInterestPayment * durationMonths);

  const schedule: PaymentScheduleItem[] = [];

  for (let i = 1; i <= durationMonths; i++) {
    const isLastPayment = i === durationMonths;
    const payment = isLastPayment ? monthlyInterestPayment + principal : monthlyInterestPayment;
    const principalPayment = isLastPayment ? principal : 0;

    schedule.push({
      period: i,
      date: safeAddMonths(startDate, i),
      payment: roundCents(payment),
      principal: principalPayment,
      interest: monthlyInterestPayment,
      remainingBalance: isLastPayment ? 0 : principal
    });
  }

  return {
    monthlyPayment: monthlyInterestPayment,
    totalInterest,
    totalAmount: roundCents(principal + totalInterest),
    schedule
  };
};

const getFrequencyMonths = (frequency: string): number => {
  switch (frequency) {
    case 'monthly': return 1;
    case 'quarterly': return 3;
    case 'semi_annual': return 6;
    case 'annual': return 12;
    default: return 1;
  }
};

export const calculateLoanWithFrequency = (
  principal: number,
  annualRate: number,
  durationMonths: number,
  frequency: string,
  loanType: 'amortizable' | 'bullet',
  startDate: Date = new Date()
): LoanCalculation => {
  if (durationMonths <= 0 || principal <= 0) {
    return { monthlyPayment: 0, totalInterest: 0, totalAmount: principal, schedule: [] };
  }

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
    const interestPayment = roundCents(remainingBalance * periodRate);
    const isLast = i === numberOfPayments;
    const principalPayment = isLast ? remainingBalance : roundCents(payment - interestPayment);
    const actualPayment = isLast ? principalPayment + interestPayment : payment;
    remainingBalance = isLast ? 0 : roundCents(remainingBalance - principalPayment);
    totalInterest += interestPayment;

    schedule.push({
      period: i,
      date: safeAddMonths(startDate, i * frequencyMonths),
      payment: roundCents(actualPayment),
      principal: principalPayment,
      interest: interestPayment,
      remainingBalance: Math.max(0, remainingBalance)
    });
  }

  return {
    monthlyPayment: roundCents(payment),
    totalInterest: roundCents(totalInterest),
    totalAmount: roundCents(principal + totalInterest),
    schedule
  };
};
