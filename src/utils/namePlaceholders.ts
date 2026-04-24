import { format } from 'date-fns';
import { fr, enUS } from 'date-fns/locale';

const LOCALES: Record<string, Locale> = { fr, en: enUS };

export function resolveNamePlaceholders(template: string, date: Date, lang = 'fr'): string {
  const locale = LOCALES[lang] || fr;

  return template
    .replace(/\{MOIS\}/gi, format(date, 'MMMM', { locale }))
    .replace(/\{MONTH\}/gi, format(date, 'MMMM', { locale }))
    .replace(/\{MM\}/g, format(date, 'MM'))
    .replace(/\{ANNEE\}/gi, format(date, 'yyyy'))
    .replace(/\{YEAR\}/gi, format(date, 'yyyy'))
    .replace(/\{YY\}/g, format(date, 'yy'))
    .replace(/\{JOUR\}/gi, format(date, 'dd'))
    .replace(/\{DAY\}/gi, format(date, 'dd'));
}

export const AVAILABLE_PLACEHOLDERS = [
  { key: '{MOIS}', label: 'Mois (texte)', example: 'Avril' },
  { key: '{MM}', label: 'Mois (chiffre)', example: '04' },
  { key: '{ANNEE}', label: 'Année', example: '2026' },
  { key: '{YY}', label: 'Année courte', example: '26' },
  { key: '{JOUR}', label: 'Jour', example: '15' },
];

export function hasPlaceholders(text: string): boolean {
  return /\{(MOIS|MONTH|MM|ANNEE|YEAR|YY|JOUR|DAY)\}/i.test(text);
}
