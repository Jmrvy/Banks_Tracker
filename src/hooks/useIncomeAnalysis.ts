import { useMemo } from 'react';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  value_date?: string;
  type: 'income' | 'expense' | 'transfer';
  account?: {
    name: string;
  };
  include_in_stats?: boolean;
  refund_of_transaction_id?: string | null;
}

export interface IncomeCategory {
  category: string;
  transactions: Transaction[];
  totalAmount: number;
  count: number;
}

// Mots à ignorer (stop words) — constant, allocated once
const STOP_WORDS = new Set([
  'de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou',
  'pour', 'par', 'avec', 'dans', 'sur', 'en', 'au', 'aux'
]);

// Fonction pour extraire les mots-clés principaux d'une description
const extractKeywords = (description: string): string[] => {
  const cleaned = description
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return cleaned.split(' ').filter(w => w.length > 2 && !STOP_WORDS.has(w));
};

// Calculer la similarité entre deux ensembles de mots-clés (pre-extracted)
const calculateSimilarityFromKeywords = (keywords1: string[], keywords2: string[]): number => {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;

  // Use Set for O(1) lookups instead of Array.includes O(n)
  const set2 = new Set(keywords2);
  let commonWords = 0;
  for (const w of keywords1) {
    if (set2.has(w)) commonWords++;
  }

  const unionSize = new Set([...keywords1, ...keywords2]).size;
  const similarity = commonWords / unionSize;

  // Bonus si les premiers mots sont identiques
  const firstWordBonus = keywords1[0] === keywords2[0] ? 0.2 : 0;

  return Math.min(1, similarity + firstWordBonus);
};

// Fonction pour trouver la meilleure catégorie pour des mots-clés
const findBestCategory = (
  keywords: string[],
  categories: Map<string, { transactions: Transaction[]; keywordsCache: string[][] }>,
  threshold: number = 0.4
): string | null => {
  let bestCategory: string | null = null;
  let bestScore = threshold;

  for (const [category, data] of categories.entries()) {
    // Compare against cached keywords of each transaction in the category
    let totalScore = 0;
    for (const cachedKw of data.keywordsCache) {
      totalScore += calculateSimilarityFromKeywords(keywords, cachedKw);
    }
    const avgScore = totalScore / data.keywordsCache.length;

    if (avgScore > bestScore) {
      bestScore = avgScore;
      bestCategory = category;
    }
  }

  return bestCategory;
};

// Fonction pour générer un nom de catégorie à partir des descriptions
const generateCategoryName = (transactions: Transaction[]): string => {
  if (transactions.length === 0) return 'Autres';

  // Extraire les mots-clés communs
  const allKeywords = transactions.map(t => extractKeywords(t.description));

  // Trouver les mots qui apparaissent dans au moins 50% des descriptions
  const wordCount = new Map<string, number>();
  allKeywords.forEach(keywords => {
    keywords.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });
  });

  const commonWords = Array.from(wordCount.entries())
    .filter(([_, count]) => count >= Math.max(2, transactions.length * 0.5))
    .sort((a, b) => b[1] - a[1])
    .map(([word]) => word)
    .slice(0, 3);

  if (commonWords.length > 0) {
    return commonWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Sinon, utiliser le début de la première description
  const firstDesc = transactions[0].description;
  const words = extractKeywords(firstDesc);
  return words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || firstDesc.substring(0, 20);
};

export const useIncomeAnalysis = (transactions: Transaction[]): IncomeCategory[] => {
  return useMemo(() => {
    // Filtrer uniquement les revenus qui sont inclus dans les statistiques
    // Exclure les transactions de remboursement
    const incomeTransactions = transactions.filter(t =>
      t.type === 'income' &&
      t.include_in_stats !== false &&
      !t.refund_of_transaction_id
    );

    if (incomeTransactions.length === 0) return [];

    // Pre-extract keywords for all transactions (done once, not per comparison)
    const keywordsMap = new Map<string, string[]>();
    for (const t of incomeTransactions) {
      keywordsMap.set(t.id, extractKeywords(t.description));
    }

    // Grouper les transactions par similarité
    const categories = new Map<string, { transactions: Transaction[]; keywordsCache: string[][] }>();

    for (const transaction of incomeTransactions) {
      const keywords = keywordsMap.get(transaction.id)!;
      const bestCategory = findBestCategory(keywords, categories);

      if (bestCategory) {
        const data = categories.get(bestCategory)!;
        data.transactions.push(transaction);
        data.keywordsCache.push(keywords);
      } else {
        categories.set(transaction.description, {
          transactions: [transaction],
          keywordsCache: [keywords]
        });
      }
    }

    // Convertir en tableau et générer les noms de catégories
    const result: IncomeCategory[] = Array.from(categories.values()).map(({ transactions }) => {
      const categoryName = generateCategoryName(transactions);
      const totalAmount = transactions.reduce((sum, t) => sum + Number(t.amount), 0);

      return {
        category: categoryName,
        transactions,
        totalAmount,
        count: transactions.length
      };
    });

    // Trier par montant total décroissant
    return result.sort((a, b) => b.totalAmount - a.totalAmount);
  }, [transactions]);
};
