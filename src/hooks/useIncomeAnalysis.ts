import { useMemo } from 'react';

interface Transaction {
  id: string;
  description: string;
  amount: number;
  transaction_date: string;
  type: 'income' | 'expense' | 'transfer';
  account?: {
    name: string;
  };
}

export interface IncomeCategory {
  category: string;
  transactions: Transaction[];
  totalAmount: number;
  count: number;
}

// Fonction pour extraire les mots-clés principaux d'une description
const extractKeywords = (description: string): string[] => {
  // Nettoyer et normaliser
  const cleaned = description
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Mots à ignorer (stop words)
  const stopWords = new Set([
    'de', 'du', 'le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou',
    'pour', 'par', 'avec', 'dans', 'sur', 'en', 'au', 'aux'
  ]);
  
  const words = cleaned.split(' ').filter(w => w.length > 2 && !stopWords.has(w));
  return words;
};

// Fonction pour calculer la similarité entre deux descriptions
const calculateSimilarity = (desc1: string, desc2: string): number => {
  const keywords1 = extractKeywords(desc1);
  const keywords2 = extractKeywords(desc2);
  
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  // Calculer le nombre de mots en commun
  const commonWords = keywords1.filter(w => keywords2.includes(w)).length;
  
  // Calculer la similarité Jaccard
  const unionSize = new Set([...keywords1, ...keywords2]).size;
  const similarity = commonWords / unionSize;
  
  // Bonus si les premiers mots sont identiques
  const firstWordBonus = keywords1[0] === keywords2[0] ? 0.2 : 0;
  
  return Math.min(1, similarity + firstWordBonus);
};

// Fonction pour trouver la meilleure catégorie pour une description
const findBestCategory = (
  description: string,
  categories: Map<string, Transaction[]>,
  threshold: number = 0.4
): string | null => {
  let bestCategory: string | null = null;
  let bestScore = threshold;
  
  for (const [category, transactions] of categories.entries()) {
    // Calculer la similarité moyenne avec toutes les transactions de la catégorie
    const scores = transactions.map(t => calculateSimilarity(description, t.description));
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    
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
    // Filtrer uniquement les revenus
    const incomeTransactions = transactions.filter(t => t.type === 'income');
    
    if (incomeTransactions.length === 0) return [];
    
    // Grouper les transactions par similarité
    const categories = new Map<string, Transaction[]>();
    
    incomeTransactions.forEach(transaction => {
      const bestCategory = findBestCategory(transaction.description, categories);
      
      if (bestCategory) {
        // Ajouter à la catégorie existante
        categories.get(bestCategory)!.push(transaction);
      } else {
        // Créer une nouvelle catégorie avec cette transaction
        categories.set(transaction.description, [transaction]);
      }
    });
    
    // Convertir en tableau et générer les noms de catégories
    const result: IncomeCategory[] = Array.from(categories.entries()).map(([_, transactions]) => {
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
