import type { ParsedScheduleRow, ParsedLoanInfo } from './pdfScheduleParser';

/**
 * Parse a date string in various formats to YYYY-MM-DD
 */
function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  dateStr = dateStr.trim();

  // Already YYYY-MM-DD
  let match = dateStr.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, year, month, day] = match;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  // DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  match = dateStr.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})/);
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
    'oct': '10', 'nov': '11', 'déc': '12', 'dec': '12',
  };

  const monthPattern = Object.keys(frMonths).join('|');
  const frMatch = dateStr.match(new RegExp(`(\\d{1,2})\\s+(${monthPattern})\\.?\\s+(\\d{4})`, 'i'));
  if (frMatch) {
    const [, day, monthName, year] = frMatch;
    const month = frMonths[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${day.padStart(2, '0')}`;
  }

  // Try native Date as fallback (handles Excel serial dates converted to strings)
  const d = new Date(dateStr);
  if (!isNaN(d.getTime()) && d.getFullYear() > 1990 && d.getFullYear() < 2100) {
    return d.toISOString().split('T')[0];
  }

  return null;
}

/**
 * Parse a number from a cell value (handles French format, currency symbols, etc.)
 */
function parseNumber(val: unknown): number | null {
  if (typeof val === 'number') return Math.abs(val);
  if (typeof val !== 'string' || !val.trim()) return null;

  let cleaned = val.replace(/[\s\u00A0]/g, '').trim();
  cleaned = cleaned.replace(/[€$£]/g, '').trim();
  cleaned = cleaned.replace(',', '.');
  cleaned = cleaned.replace(/\.$/, '');
  cleaned = cleaned.replace(/^[^\d.-]+|[^\d.]+$/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) ? null : Math.abs(num);
}

/**
 * Known column name patterns (French & English) mapped to schedule fields
 */
const COLUMN_PATTERNS: Record<string, RegExp> = {
  date: /^(date|échéance|echeance|period|mois|month)/i,
  payment: /^(mensualit|paiement|payment|montant.*éch|montant.*ech|annuit|total.*éch|total.*ech|remboursement)/i,
  principal: /^(capital|principal|amortissement|amort)/i,
  interest: /^(intérêt|interet|interest|frais.*financ)/i,
  insurance: /^(assurance|insurance|cotisation)/i,
  remainingBalance: /^(capital.*restant|solde|crd|restant|remaining|balance|encours)/i,
  periodNumber: /^(n°|num|no|#|période|periodo|period$|éch.*n)/i,
};

/**
 * Detect which column maps to which schedule field based on header names
 */
function detectColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]?.toString().trim();
    if (!header) continue;

    for (const [field, pattern] of Object.entries(COLUMN_PATTERNS)) {
      if (pattern.test(header) && !(field in mapping)) {
        mapping[field] = i;
        break;
      }
    }
  }

  return mapping;
}

/**
 * If no header matched, try positional mapping based on common layouts
 */
function fallbackColumnMapping(row: unknown[], hasDateColumn: number | undefined): Record<string, number> {
  const mapping: Record<string, number> = {};

  // Find the first column that looks like a date
  let dateCol = hasDateColumn;
  if (dateCol === undefined) {
    for (let i = 0; i < row.length; i++) {
      if (parseDate(String(row[i] ?? ''))) {
        dateCol = i;
        break;
      }
    }
  }

  if (dateCol === undefined) return mapping;
  mapping.date = dateCol;

  // Count numeric columns after the date
  const numericCols: number[] = [];
  for (let i = 0; i < row.length; i++) {
    if (i === dateCol) continue;
    const num = parseNumber(row[i]);
    if (num !== null && num > 0) {
      numericCols.push(i);
    }
  }

  // Common layouts after date column:
  // 2 nums: payment, CRD
  // 3 nums: payment, principal/interest, CRD
  // 4 nums: payment, principal, interest, CRD
  // 5 nums: payment, principal, interest, insurance, CRD
  // 6+ nums: N°, payment, principal, interest, insurance, CRD
  if (numericCols.length >= 2) {
    // Skip period number if it looks like a small sequential number
    let start = 0;
    const firstVal = parseNumber(row[numericCols[0]]);
    if (firstVal !== null && firstVal < 1000 && numericCols.length >= 3) {
      mapping.periodNumber = numericCols[0];
      start = 1;
    }

    const remaining = numericCols.slice(start);
    if (remaining.length >= 5) {
      mapping.payment = remaining[0];
      mapping.principal = remaining[1];
      mapping.interest = remaining[2];
      mapping.insurance = remaining[3];
      mapping.remainingBalance = remaining[remaining.length - 1];
    } else if (remaining.length >= 4) {
      mapping.payment = remaining[0];
      mapping.principal = remaining[1];
      mapping.interest = remaining[2];
      mapping.remainingBalance = remaining[remaining.length - 1];
    } else if (remaining.length >= 3) {
      mapping.payment = remaining[0];
      mapping.principal = remaining[1];
      mapping.remainingBalance = remaining[remaining.length - 1];
    } else if (remaining.length >= 2) {
      mapping.payment = remaining[0];
      mapping.remainingBalance = remaining[remaining.length - 1];
    }
  }

  return mapping;
}

/**
 * Parse rows from a 2D array (from CSV or Excel sheet)
 */
function parseRowsFromGrid(grid: unknown[][]): { schedule: ParsedScheduleRow[]; loanInfo: Partial<ParsedLoanInfo> } {
  if (grid.length < 2) return { schedule: [], loanInfo: {} };

  // Try to detect header row — look for a row where multiple cells match column patterns
  let headerRowIndex = -1;
  let columnMapping: Record<string, number> = {};

  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const row = grid[i];
    if (!row || row.length < 2) continue;

    const mapping = detectColumnMapping(row.map(c => String(c ?? '')));
    const matchCount = Object.keys(mapping).length;

    if (matchCount >= 2 && ('date' in mapping || 'payment' in mapping)) {
      headerRowIndex = i;
      columnMapping = mapping;
      break;
    }
  }

  // Determine data start row
  const dataStartRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

  // If no header detected, try fallback mapping from first data row
  if (Object.keys(columnMapping).length < 2 && grid[dataStartRow]) {
    columnMapping = fallbackColumnMapping(grid[dataStartRow], undefined);
  }

  // Parse schedule rows
  const schedule: ParsedScheduleRow[] = [];
  for (let i = dataStartRow; i < grid.length; i++) {
    const row = grid[i];
    if (!row || row.length < 2) continue;

    // Try to find a date in this row
    let date: string | null = null;
    if ('date' in columnMapping) {
      date = parseDate(String(row[columnMapping.date] ?? ''));
    }
    // Fallback: scan all cells for a date
    if (!date) {
      for (let j = 0; j < row.length; j++) {
        date = parseDate(String(row[j] ?? ''));
        if (date) {
          // Update mapping if we didn't have a date column
          if (!('date' in columnMapping)) {
            columnMapping = fallbackColumnMapping(row, j);
          }
          break;
        }
      }
    }

    if (!date) continue;

    const payment = 'payment' in columnMapping ? (parseNumber(row[columnMapping.payment]) ?? 0) : 0;
    const principal = 'principal' in columnMapping ? (parseNumber(row[columnMapping.principal]) ?? 0) : 0;
    const interest = 'interest' in columnMapping ? (parseNumber(row[columnMapping.interest]) ?? 0) : 0;
    const insurance = 'insurance' in columnMapping ? (parseNumber(row[columnMapping.insurance]) ?? 0) : 0;
    const remainingBalance = 'remainingBalance' in columnMapping ? (parseNumber(row[columnMapping.remainingBalance]) ?? 0) : 0;

    // Skip rows with no meaningful amounts
    if (payment <= 0 && principal <= 0 && remainingBalance <= 0) continue;

    schedule.push({ date, payment, principal, interest, insurance, remainingBalance });
  }

  // Try to infer loan info from the schedule
  const loanInfo: Partial<ParsedLoanInfo> = {};
  if (schedule.length > 0) {
    loanInfo.startDate = schedule[0].date;
    loanInfo.duration = schedule.length;
    if (schedule[0].payment > 0) {
      loanInfo.monthlyPayment = schedule[0].payment;
    }
    if (schedule[0].remainingBalance > 0) {
      loanInfo.totalAmount = schedule[0].remainingBalance + schedule[0].principal;
    }
    // Estimate interest rate from first row if we have principal and interest
    if (schedule[0].interest > 0 && schedule[0].remainingBalance > 0) {
      const monthlyRate = schedule[0].interest / (schedule[0].remainingBalance + schedule[0].principal);
      const annualRate = monthlyRate * 12 * 100;
      if (annualRate > 0 && annualRate < 30) {
        loanInfo.interestRate = Math.round(annualRate * 100) / 100;
      }
    }
  }

  return { schedule, loanInfo };
}

/**
 * Parse a CSV file into a 2D array
 */
function parseCSV(text: string): unknown[][] {
  const rows: unknown[][] = [];
  const lines = text.split(/\r?\n/);

  // Detect delimiter: semicolon (French) or comma
  const firstLine = lines[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';

  for (const line of lines) {
    if (!line.trim()) continue;

    // Simple CSV split handling quoted fields
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delimiter && !inQuotes) {
        cells.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    cells.push(current.trim());

    if (cells.some(c => c !== '')) {
      rows.push(cells);
    }
  }

  return rows;
}

/**
 * Parse a CSV file and extract schedule data
 */
export async function parseCSVSchedule(file: File): Promise<ParsedLoanInfo> {
  const text = await file.text();
  const grid = parseCSV(text);
  const { schedule, loanInfo } = parseRowsFromGrid(grid);

  return {
    totalAmount: loanInfo.totalAmount || null,
    interestRate: loanInfo.interestRate || null,
    duration: loanInfo.duration || null,
    monthlyPayment: loanInfo.monthlyPayment || null,
    startDate: loanInfo.startDate || null,
    description: null,
    schedule,
  };
}

/**
 * Parse an Excel file and extract schedule data
 */
export async function parseExcelSchedule(file: File): Promise<ParsedLoanInfo> {
  const XLSX = await import('xlsx');
  const arrayBuffer = await file.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });

  // Use the first sheet
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { totalAmount: null, interestRate: null, duration: null, monthlyPayment: null, startDate: null, description: null, schedule: [] };
  }

  const sheet = workbook.Sheets[sheetName];
  const grid: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, dateNF: 'dd/mm/yyyy' });

  const { schedule, loanInfo } = parseRowsFromGrid(grid);

  return {
    totalAmount: loanInfo.totalAmount || null,
    interestRate: loanInfo.interestRate || null,
    duration: loanInfo.duration || null,
    monthlyPayment: loanInfo.monthlyPayment || null,
    startDate: loanInfo.startDate || null,
    description: null,
    schedule,
  };
}
