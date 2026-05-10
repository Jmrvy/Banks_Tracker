import { useTranslation } from "react-i18next";
import { fr, enUS } from "date-fns/locale";

/**
 * Resolves the active date-fns locale from i18n. Use this anywhere a
 * `date-fns` `format(..., { locale })` call is made so dates render in
 * the user's UI language instead of being hard-coded to French.
 */
export function useDateFnsLocale() {
  const { i18n } = useTranslation();
  return i18n.language === "fr" ? fr : enUS;
}
