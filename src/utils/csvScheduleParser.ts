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
 * Expected CSV format (French bank amortization schedule):
 *
 * DATE;N°;Montant échéance;Intérêts;Assurance;Capital amorti;Capital restant dû
 * 25/09/2024;DBL;0.00;0.00;0.00;0.00;20000.00
 * 20/10/2024;1;66.88;25.48;41.40;0.00;20000.00
 * ...
 * 20/11/2031;86;295.52;0.35;41.40;253.77;0.00
 *
 * - Delimiter: semicolon (;) or comma (,)
 * - Decimal separator: dot (.) or comma (,) if semicolon delimiter
 * - First data row with N°=DBL is the disbursement line (optional)
 * - Last row must have Capital restant dû = 0.00
 */

export interface CsvValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Parse a number from a cell value (handles French format with comma decimals)
 */
function parseNumber(val: string, useCommaDot: boolean): number {
  if (!val || !val.trim()) return 0;
  let cleaned = val.replace(/[\s\u00A0€$£]/g, '').trim();
  if (useCommaDot) {
    // Semicolon-delimited: comma is decimal separator
    cleaned = cleaned.replace(',', '.');
  } else {
    // Comma-delimited: dot is decimal separator (commas already split)
  }
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse a date from DD/MM/YYYY format to YYYY-MM-DD
 */
function parseDateDMY(dateStr: string): string | null {
  if (!dateStr) return null;
  const trimmed = dateStr.trim();

  const match = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (!match) return null;

  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Detect delimiter from the first lines of CSV text
 */
function detectDelimiter(text: string): ';' | ',' | '\t' {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  return ',';
}

/**
 * Split a CSV line respecting quoted fields
 */
function splitCSVLine(line: string, delimiter: string): string[] {
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
  return cells;
}

/**
 * Normalize a header name for matching (lowercase, remove accents, trim,
 * and also strip U+FFFD replacement characters from encoding failures)
 */
function normalizeHeader(h: string): string {
  return h.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const EXPECTED_HEADERS: Record<string, string[]> = {
  date: ['date'],
  periodNumber: ['n', 'no', 'numero'],
  payment: ['montantecheance', 'montantech', 'echeance', 'mensualite', 'paiement', 'montant'],
  interest: ['interets', 'interet', 'interest'],
  insurance: ['assurance', 'insurance', 'cotisation'],
  principal: ['capitalamorti', 'amortissement', 'principal'],
  remainingBalance: ['capitalrestantdu', 'capitalrestant', 'crd', 'solde', 'restant', 'remaining'],
};

/**
 * Match CSV headers to expected columns. Returns mapping or null if invalid.
 * Uses positional matching for the standard 7-column French bank format first,
 * then falls back to name-based matching.
 */
function matchHeaders(headers: string[]): Record<string, number> | null {
  // Standard 7-column format: Date;N°;Montant échéance;Intérêts;Assurance;Capital amorti;Capital restant dû
  if (headers.length >= 7) {
    const first = normalizeHeader(headers[0]);
    if (first === 'date' || first.includes('date')) {
      return {
        date: 0,
        periodNumber: 1,
        payment: 2,
        interest: 3,
        insurance: 4,
        principal: 5,
        remainingBalance: 6,
      };
    }
  }

  // Fallback: name-based matching
  const mapping: Record<string, number> = {};
  const normalized = headers.map(normalizeHeader);

  for (const [field, patterns] of Object.entries(EXPECTED_HEADERS)) {
    for (let i = 0; i < normalized.length; i++) {
      if (patterns.some(p => normalized[i].includes(p))) {
        mapping[field] = i;
        break;
      }
    }
  }

  if (!('date' in mapping)) return null;
  if (!('payment' in mapping) && !('remainingBalance' in mapping)) return null;

  return mapping;
}

/**
 * Validate the parsed schedule data
 */
export function validateSchedule(schedule: ParsedScheduleRow[], totalAmount: number | null): CsvValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (schedule.length === 0) {
    errors.push('Aucune échéance détectée dans le fichier');
    return { valid: false, errors, warnings };
  }

  // Check last row remaining balance is 0
  const lastRow = schedule[schedule.length - 1];
  if (lastRow.remainingBalance > 0.01) {
    errors.push(
      `Le capital restant dû de la dernière échéance est de ${lastRow.remainingBalance.toFixed(2)} (attendu: 0.00)`
    );
  }

  // Check dates are chronological
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].date < schedule[i - 1].date) {
      warnings.push(`Dates non chronologiques aux lignes ${i} et ${i + 1}`);
      break;
    }
  }

  // Check remaining balance is decreasing (with tolerance for insurance-only periods)
  let nonDecreasingCount = 0;
  for (let i = 1; i < schedule.length; i++) {
    if (schedule[i].remainingBalance > schedule[i - 1].remainingBalance + 0.01) {
      nonDecreasingCount++;
    }
  }
  if (nonDecreasingCount > 0) {
    warnings.push(`Le capital restant dû augmente sur ${nonDecreasingCount} échéance(s)`);
  }

  // Check total amount matches first row CRD (if provided)
  if (totalAmount && schedule[0].remainingBalance > 0) {
    const diff = Math.abs(totalAmount - schedule[0].remainingBalance);
    if (diff > 1) {
      warnings.push(
        `Le montant total (${totalAmount.toFixed(2)}) ne correspond pas au capital restant initial (${schedule[0].remainingBalance.toFixed(2)})`
      );
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Parse a CSV file with the expected bank amortization schedule format.
 * Only accepts CSV — no PDF or Excel.
 */
/**
 * Read file text with encoding detection.
 * French bank CSVs are often Windows-1252/ISO-8859-1, not UTF-8.
 * Detects encoding failures by checking for U+FFFD replacement characters.
 */
async function readFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8').decode(buffer);
  if (utf8Text.includes('�')) {
    return new TextDecoder('windows-1252').decode(buffer);
  }
  return utf8Text;
}

export async function parseLoanCSV(file: File): Promise<ParsedLoanInfo & { validation: CsvValidationResult }> {
  const text = await readFileText(file);
  const delimiter = detectDelimiter(text);
  const useCommaDot = delimiter === ';' || delimiter === '\t';
  const lines = text.split(/\r?\n/).filter(l => l.trim());

  if (lines.length < 2) {
    const validation: CsvValidationResult = { valid: false, errors: ['Le fichier est vide ou ne contient qu\'une seule ligne'], warnings: [] };
    return { totalAmount: null, interestRate: null, duration: null, monthlyPayment: null, startDate: null, description: null, schedule: [], validation };
  }

  // Parse header row
  const headerCells = splitCSVLine(lines[0], delimiter);
  const mapping = matchHeaders(headerCells);

  if (!mapping) {
    const validation: CsvValidationResult = {
      valid: false,
      errors: [
        'Format CSV non reconnu. Colonnes attendues : DATE, N°, Montant échéance, Intérêts, Assurance, Capital amorti, Capital restant dû'
      ],
      warnings: [],
    };
    return { totalAmount: null, interestRate: null, duration: null, monthlyPayment: null, startDate: null, description: null, schedule: [], validation };
  }

  // Parse data rows
  const schedule: ParsedScheduleRow[] = [];
  let disbursementAmount: number | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i], delimiter);
    if (cells.length < 3) continue;

    const dateStr = 'date' in mapping ? parseDateDMY(cells[mapping.date]) : null;
    if (!dateStr) continue;

    // Check if this is the DBL (disbursement) row
    const periodNum = 'periodNumber' in mapping ? cells[mapping.periodNumber]?.trim() : '';
    if (periodNum.toUpperCase() === 'DBL') {
      // Extract initial capital from CRD column
      if ('remainingBalance' in mapping) {
        disbursementAmount = parseNumber(cells[mapping.remainingBalance], useCommaDot);
      }
      continue; // Skip this row from the schedule
    }

    const payment = 'payment' in mapping ? parseNumber(cells[mapping.payment], useCommaDot) : 0;
    const interest = 'interest' in mapping ? parseNumber(cells[mapping.interest], useCommaDot) : 0;
    const insurance = 'insurance' in mapping ? parseNumber(cells[mapping.insurance], useCommaDot) : 0;
    const principal = 'principal' in mapping ? parseNumber(cells[mapping.principal], useCommaDot) : 0;
    const remainingBalance = 'remainingBalance' in mapping ? parseNumber(cells[mapping.remainingBalance], useCommaDot) : 0;

    // Skip empty rows
    if (payment <= 0 && principal <= 0 && remainingBalance <= 0) continue;

    schedule.push({ date: dateStr, payment, principal, interest, insurance, remainingBalance });
  }

  // Infer loan info
  const totalAmount = disbursementAmount
    || (schedule.length > 0 && schedule[0].remainingBalance > 0
      ? schedule[0].remainingBalance + schedule[0].principal
      : null);

  const startDate = schedule.length > 0 ? schedule[0].date : null;
  const duration = schedule.length || null;
  const monthlyPayment = schedule.length > 0 ? schedule[0].payment : null;

  // Interest rate estimate: skip the first interest row (often a partial period)
  // and use the second one for a more accurate full-month calculation
  let interestRate: number | null = null;
  const interestRows = schedule.filter(r => r.interest > 0);
  if (interestRows.length >= 2) {
    const row = interestRows[1];
    const balanceForInterest = row.remainingBalance + row.principal;
    if (balanceForInterest > 0) {
      const monthlyRate = row.interest / balanceForInterest;
      const annual = monthlyRate * 12 * 100;
      if (annual > 0 && annual < 30) {
        interestRate = Math.round(annual * 100) / 100;
      }
    }
  } else if (interestRows.length === 1) {
    const row = interestRows[0];
    const balanceForInterest = row.remainingBalance + row.principal;
    if (balanceForInterest > 0) {
      const monthlyRate = row.interest / balanceForInterest;
      const annual = monthlyRate * 12 * 100;
      if (annual > 0 && annual < 30) {
        interestRate = Math.round(annual * 100) / 100;
      }
    }
  }

  const validation = validateSchedule(schedule, totalAmount);

  return {
    totalAmount,
    interestRate,
    duration,
    monthlyPayment,
    startDate,
    description: null,
    schedule,
    validation,
  };
}
