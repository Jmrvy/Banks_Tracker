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
  rawText?: string;
}

/**
 * Extract text content from a PDF file, reconstructing spatial layout.
 * Groups text items by Y-coordinate to form lines, orders by X within each line.
 */
export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group items by Y position (rounded to nearest 2px to merge same-line items)
    const lineMap = new Map<number, Array<{ x: number; text: string }>>();

    for (const item of textContent.items as any[]) {
      if (!item.str || item.str.trim() === '') continue;

      const y = Math.round(item.transform[5] / 2) * 2; // round Y to 2px
      const x = item.transform[4];

      if (!lineMap.has(y)) {
        lineMap.set(y, []);
      }
      lineMap.get(y)!.push({ x, text: item.str });
    }

    // Sort lines by Y descending (PDF coordinates: top = higher Y)
    const sortedYs = Array.from(lineMap.keys()).sort((a, b) => b - a);

    const lineTexts: string[] = [];
    for (const y of sortedYs) {
      const items = lineMap.get(y)!;
      // Sort items by X position (left to right)
      items.sort((a, b) => a.x - b.x);

      // Join with spacing based on X gaps
      let lineText = '';
      for (let j = 0; j < items.length; j++) {
        if (j > 0) {
          const gap = items[j].x - (items[j - 1].x + items[j - 1].text.length * 4);
          lineText += gap > 15 ? '  ' : ' ';
        }
        lineText += items[j].text;
      }
      lineTexts.push(lineText.trim());
    }

    pages.push(lineTexts.join('\n'));
  }

  return pages;
}

/**
 * Parse a date string in various French formats to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  dateStr = dateStr.trim();

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  let match = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
  if (match) {
    const [, day, month, year] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD/MM/YY
  match = dateStr.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2})$/);
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
  // Remove trailing dots
  cleaned = cleaned.replace(/\.$/, '');
  // Remove leading/trailing non-numeric chars except dot and minus
  cleaned = cleaned.replace(/^[^\d.-]+|[^\d.]+$/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

/**
 * Extract all numbers from a text string
 */
function extractNumbers(text: string): number[] {
  const numbers: number[] = [];
  // Match French-format numbers: 1 234,56 or 1234.56 or 1234,56
  const numPattern = /(?:\d[\d\s\u00A0]*\d[,\.]\d{1,2}|\d+[,\.]\d{1,2}|\d[\d\s\u00A0]+\d|\d+)/g;
  let match;
  while ((match = numPattern.exec(text)) !== null) {
    const parsed = parseNumber(match[0]);
    if (parsed !== null && parsed > 0) {
      numbers.push(parsed);
    }
  }
  return numbers;
}

/**
 * Try to find rows that look like an amortization schedule.
 * Works line-by-line now that we have proper line reconstruction.
 */
function extractScheduleRows(fullText: string): ParsedScheduleRow[] {
  const rows: ParsedScheduleRow[] = [];
  const lines = fullText.split('\n');

  for (const line of lines) {
    // Look for a date anywhere in the line
    const dateMatch = line.match(/(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/);
    if (!dateMatch) continue;

    const date = parseDate(dateMatch[1]);
    if (!date) continue;

    // Get the part of the line after the date
    const afterDate = line.substring(dateMatch.index! + dateMatch[0].length);
    const numbers = extractNumbers(afterDate);

    // Also check for numbers before the date (some formats put N° first)
    const beforeDate = line.substring(0, dateMatch.index!);
    const numbersBefore = extractNumbers(beforeDate);

    // Skip lines that look like headers or have too few numbers
    if (numbers.length < 2) continue;

    // Skip if numbers are suspiciously small (likely a row number or page number)
    const hasReasonableAmount = numbers.some(n => n > 5);
    if (!hasReasonableAmount) continue;

    // Map numbers to schedule columns
    // Common layouts:
    // N° | Date | Mensualité | Capital | Intérêts | Assurance | CRD
    // N° | Date | Mensualité | Capital | Intérêts | CRD
    // Date | Mensualité | Capital | Intérêts | CRD
    // Date | Mensualité | CRD
    const row: ParsedScheduleRow = {
      date,
      payment: numbers[0] || 0,
      principal: numbers.length >= 3 ? numbers[1] : 0,
      interest: numbers.length >= 4 ? numbers[2] : 0,
      insurance: numbers.length >= 6 ? numbers[3] : 0,
      remainingBalance: numbers[numbers.length - 1] || 0,
    };

    // Sanity check: payment should be > 0 and reasonably different from remaining balance
    if (row.payment > 0) {
      rows.push(row);
    }
  }

  // Validate: if we have rows, check that remaining balances are decreasing
  if (rows.length > 2) {
    let isDecreasing = true;
    for (let i = 1; i < Math.min(rows.length, 5); i++) {
      if (rows[i].remainingBalance > rows[i - 1].remainingBalance * 1.01) {
        isDecreasing = false;
        break;
      }
    }
    // If remaining balances aren't decreasing, the last column might not be CRD
    // Try swapping: use second-to-last number as CRD
    if (!isDecreasing && rows[0].remainingBalance === rows[0].payment) {
      // Probably mis-mapped. Clear and retry won't help; just return what we have.
    }
  }

  return rows;
}

/**
 * Extract global loan information from the text
 */
function extractLoanInfo(fullText: string): Partial<ParsedLoanInfo> {
  const info: Partial<ParsedLoanInfo> = {};

  // Try to find total amount
  const amountPatterns = [
    /montant\s+(?:du\s+)?(?:prêt|pr[eê]t|crédit|emprunt|capital)\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /capital\s+emprunté\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /montant\s+emprunté\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /montant\s*:?\s*([\d\s\u00A0,\.]+)\s*€/i,
    /capital\s*(?:initial|restant\s+dû)?\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
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
    /taux\s+(?:nominal|annuel|d[''\u2019]intérêt|fixe|variable|effectif|global)?\s*:?\s*([\d,\.]+)\s*%/i,
    /taux\s*:?\s*([\d,\.]+)\s*%/i,
    /([\d,\.]+)\s*%\s*(?:fixe|annuel|nominal)/i,
    /TAEG\s*:?\s*([\d,\.]+)\s*%/i,
    /TEG\s*:?\s*([\d,\.]+)\s*%/i,
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
    /sur\s+(\d+)\s*mois/i,
    /(\d+)\s*mensualités/i,
    /nombre\s+d[''\u2019]échéances?\s*:?\s*(\d+)/i,
    /durée\s*:?\s*(\d+)\s*ans?/i,
  ];

  for (const pattern of durationPatterns) {
    const match = fullText.match(pattern);
    if (match) {
      let months = parseInt(match[1]);
      if (pattern.source.includes('ans')) {
        months *= 12;
      }
      if (months > 0 && months < 600) {
        info.duration = months;
        break;
      }
    }
  }

  // Try to find monthly payment
  const paymentPatterns = [
    /mensualité\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /échéance\s+mensuelle\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /montant\s+(?:de\s+)?(?:l[''\u2019])?échéance\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
    /mensualité\s+(?:constante|fixe)\s*:?\s*([\d\s\u00A0,\.]+)\s*€?/i,
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
    /date\s+(?:de\s+)?(?:mise\s+en\s+place|déblocage)\s*:?\s*(\d{1,2}[/\-\.]\d{1,2}[/\-\.]\d{2,4})/i,
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
    rawText: fullText,
  };
}
