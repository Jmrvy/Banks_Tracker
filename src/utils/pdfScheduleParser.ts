import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ParsedScheduleRow {
  date: string; // YYYY-MM-DD
  payment: number;
  principal: number;
  interest: number;
  insurance: number;
  remainingBalance: number;
}

export interface ParsedLoanInfo {
  totalAmount: number | null;
  interestRate: number | null;
  duration: number | null; // in months
  monthlyPayment: number | null;
  startDate: string | null; // YYYY-MM-DD
  description: string | null;
  schedule: ParsedScheduleRow[];
}

/**
 * Extract text content from a PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    pages.push(pageText);
  }

  return pages;
}

/**
 * Parse a date string in various French formats to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  // Remove extra spaces
  dateStr = dateStr.trim();

  // DD/MM/YYYY or DD-MM-YYYY
  let match = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD/MM/YY
  match = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
  if (match) {
    const [, day, month, year] = match;
    const fullYear = parseInt(year) > 50 ? `19${year}` : `20${year}`;
    return `${fullYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // French month names: 01 janvier 2025
  const frMonths: Record<string, string> = {
    'janvier': '01', 'février': '02', 'mars': '03', 'avril': '04',
    'mai': '05', 'juin': '06', 'juillet': '07', 'août': '08',
    'septembre': '09', 'octobre': '10', 'novembre': '11', 'décembre': '12',
    'jan': '01', 'fév': '02', 'fev': '02', 'mar': '03', 'avr': '04',
    'jui': '06', 'jul': '07', 'aoû': '08', 'aou': '08', 'sep': '09',
    'oct': '10', 'nov': '11', 'déc': '12', 'dec': '12'
  };

  const monthPattern = Object.keys(frMonths).join('|');
  const frMatch = dateStr.match(new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(\\d{4})`, 'i'));
  if (frMatch) {
    const [, day, monthName, year] = frMatch;
    const month = frMonths[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, '0')}`;
  }

  return null;
}

/**
 * Parse a French number format (1 234,56 or 1234.56) to a number
 */
function parseNumber(str: string): number | null {
  if (!str) return null;
  // Remove spaces and non-breaking spaces
  let cleaned = str.replace(/[\s\u00A0]/g, '').trim();
  // Remove currency symbols
  cleaned = cleaned.replace(/[€$£]/g, '').trim();
  // Handle French format: replace comma with dot
  cleaned = cleaned.replace(',', '.');
  // Remove trailing dots with no decimals
  cleaned = cleaned.replace(/\.$/, '');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

/**
 * Try to find rows that look like an amortization schedule
 * Common columns: N° | Date | Mensualité | Capital | Intérêts | Assurance | CRD (Capital Restant Dû)
 */
function extractScheduleRows(fullText: string): ParsedScheduleRow[] {
  const rows: ParsedScheduleRow[] = [];

  // Strategy: look for patterns with dates followed by numbers
  // Pattern: date followed by multiple numbers (amount columns)
  const lines = fullText.split(/\n|\r/);

  // Also try splitting on date patterns to find rows
  const dateNumPattern = /(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})\s+([\d\s,\.€]+)/g;
  let match;

  while ((match = dateNumPattern.exec(fullText)) !== null) {
    const dateStr = match[1];
    const numbersStr = match[2];
    const date = parseDate(dateStr);
    if (!date) continue;

    // Extract all numbers from the rest of the line
    const numbers: number[] = [];
    const numMatches = numbersStr.match(/[\d\s]*\d+[,.]?\d*/g);
    if (numMatches) {
      for (const n of numMatches) {
        const parsed = parseNumber(n);
        if (parsed !== null && parsed > 0) {
          numbers.push(parsed);
        }
      }
    }

    // We need at least 2 numbers (payment + remaining balance)
    if (numbers.length >= 2) {
      const row: ParsedScheduleRow = {
        date,
        payment: numbers[0] || 0,
        principal: numbers.length >= 3 ? numbers[1] : 0,
        interest: numbers.length >= 4 ? numbers[2] : 0,
        insurance: numbers.length >= 5 ? numbers[3] : 0,
        remainingBalance: numbers[numbers.length - 1] || 0,
      };
      rows.push(row);
    }
  }

  return rows;
}

/**
 * Extract global loan information from the text
 */
function extractLoanInfo(fullText: string): Partial<ParsedLoanInfo> {
  const info: Partial<ParsedLoanInfo> = {};
  const textLower = fullText.toLowerCase();

  // Try to find total amount
  const amountPatterns = [
    /montant\s+(?:du\s+)?(?:prêt|pr[eê]t|crédit|emprunt|capital)\s*:?\s*([\d\s,\.]+)\s*€?/i,
    /capital\s+emprunté\s*:?\s*([\d\s,\.]+)\s*€?/i,
    /montant\s+emprunté\s*:?\s*([\d\s,\.]+)\s*€?/i,
    /montant\s*:?\s*([\d\s,\.]+)\s*€/i,
  ];

  for (const pattern of amountPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const amount = parseNumber(match[1]);
      if (amount && amount > 100) {
        info.totalAmount = amount;
        break;
      }
    }
  }

  // Try to find interest rate
  const ratePatterns = [
    /taux\s+(?:nominal|annuel|d['']intérêt|fixe|variable)?\s*:?\s*([\d,\.]+)\s*%/i,
    /taux\s*:?\s*([\d,\.]+)\s*%/i,
    /([\d,\.]+)\s*%\s*(?:fixe|annuel|nominal)/i,
  ];

  for (const pattern of ratePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const rate = parseNumber(match[1]);
      if (rate !== null && rate > 0 && rate < 30) {
        info.interestRate = rate;
        break;
      }
    }
  }

  // Try to find duration
  const durationPatterns = [
    /durée\s*:?\s*(\d+)\s*mois/i,
    /(\d+)\s*mois/i,
    /durée\s*:?\s*(\d+)\s*ans?/i,
    /(\d+)\s*ans?\s+(?:et\s+)?(\d+)?\s*mois?/i,
  ];

  for (const pattern of durationPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      let months = parseInt(match[1]);
      if (fullText.match(/durée\s*:?\s*\d+\s*ans?/i) || pattern.source.includes('ans')) {
        months *= 12;
        if (match[2]) months += parseInt(match[2]);
      }
      if (months > 0 && months < 600) {
        info.duration = months;
        break;
      }
    }
  }

  // Try to find monthly payment
  const paymentPatterns = [
    /mensualité\s*:?\s*([\d\s,\.]+)\s*€?/i,
    /échéance\s+mensuelle\s*:?\s*([\d\s,\.]+)\s*€?/i,
    /montant\s+(?:de\s+)?(?:l[''])?échéance\s*:?\s*([\d\s,\.]+)\s*€?/i,
  ];

  for (const pattern of paymentPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const payment = parseNumber(match[1]);
      if (payment && payment > 10) {
        info.monthlyPayment = payment;
        break;
      }
    }
  }

  // Try to find start date
  const datePatterns = [
    /(?:date\s+de\s+)?(?:première|1[eè]re?)\s+échéance\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /date\s+de\s+début\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
    /(?:à\s+compter|à\s+partir)\s+du\s+(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
  ];

  for (const pattern of datePatterns) {
    const match = fullText.match(pattern);
    if (match) {
      const date = parseDate(match[1]);
      if (date) {
        info.startDate = date;
        break;
      }
    }
  }

  return info;
}

/**
 * Main parsing function: extract loan info and schedule from PDF
 */
export async function parseLoanPDF(file: File): Promise<ParsedLoanInfo> {
  const pages = await extractTextFromPDF(file);
  const fullText = pages.join('\n');

  // Extract global info
  const globalInfo = extractLoanInfo(fullText);

  // Extract schedule rows
  const schedule = extractScheduleRows(fullText);

  // Try to infer missing info from the schedule
  if (schedule.length > 0) {
    if (!globalInfo.monthlyPayment && schedule[0].payment > 0) {
      globalInfo.monthlyPayment = schedule[0].payment;
    }
    if (!globalInfo.startDate && schedule[0].date) {
      globalInfo.startDate = schedule[0].date;
    }
    if (!globalInfo.totalAmount && schedule[0].remainingBalance > 0) {
      // First row's remaining + first principal ≈ total
      globalInfo.totalAmount = schedule[0].remainingBalance + schedule[0].principal;
    }
    if (!globalInfo.duration) {
      globalInfo.duration = schedule.length;
    }
  }

  return {
    totalAmount: globalInfo.totalAmount || null,
    interestRate: globalInfo.interestRate || null,
    duration: globalInfo.duration || null,
    monthlyPayment: globalInfo.monthlyPayment || null,
    startDate: globalInfo.startDate || null,
    description: null,
    schedule,
  };
}

/**
 * Get raw text from PDF for preview/debug
 */
export async function getPDFRawText(file: File): Promise<string> {
  const pages = await extractTextFromPDF(file);
  return pages.join('\n---PAGE BREAK---\n');
}
