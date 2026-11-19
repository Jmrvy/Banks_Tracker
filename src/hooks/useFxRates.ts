import { useQuery } from '@tanstack/react-query';

/**
 * Today's market rates (ECB reference, via frankfurter.dev — free, no key),
 * expressed as base currency per ONE foreign unit: { GBP: 1.2006 } means
 * 1 GBP = 1.2006 EUR. Used only to value a subaccount's balance in net
 * worth; statistics use the subaccount's weighted average rate instead.
 *
 * The last answer is kept in localStorage so totals stay sensible offline;
 * callers fall back to the average rate when no market rate is known.
 */
const STORAGE_KEY = 'fxRatesCache';

type Cache = { base: string; date: string; rates: Record<string, number> };

function readCache(base: string): Cache | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Cache;
    return parsed.base === base ? parsed : null;
  } catch {
    return null;
  }
}

export function useFxRates(base: string, currencies: string[]) {
  const wanted = Array.from(new Set(currencies.filter((c) => c && c !== base))).sort();

  const query = useQuery({
    queryKey: ['fxRates', base, wanted.join(',')],
    enabled: wanted.length > 0,
    staleTime: 6 * 60 * 60 * 1000,
    retry: 1,
    queryFn: async (): Promise<Cache> => {
      try {
        const res = await fetch(
          `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(base)}&symbols=${wanted.map(encodeURIComponent).join(',')}`,
        );
        if (!res.ok) throw new Error(`fx ${res.status}`);
        const json = (await res.json()) as { date: string; rates: Record<string, number> };
        const rates: Record<string, number> = {};
        for (const [cur, perBase] of Object.entries(json.rates ?? {})) {
          if (perBase > 0) rates[cur] = 1 / perBase;
        }
        const prev = readCache(base);
        const next: Cache = { base, date: json.date, rates: { ...(prev?.rates ?? {}), ...rates } };
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* private mode */
        }
        return next;
      } catch (e) {
        const cached = readCache(base);
        if (cached) return cached;
        throw e;
      }
    },
    placeholderData: () => readCache(base) ?? undefined,
  });

  return {
    rates: query.data?.rates ?? {},
    date: query.data?.date ?? null,
  };
}
