#!/usr/bin/env python3
"""
JMRVY CB - API Client Example
Script d'exemple pour récupérer les transactions via l'API
"""

import requests
import csv
from datetime import datetime, timedelta
from typing import Optional, List

# =============================================================================
# CONFIGURATION - Remplacez par vos valeurs
# =============================================================================

API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions"
API_KEY = "votre_cle_api"  # Remplacez par votre clé API
EMAIL = "votre.email@example.com"  # Remplacez par votre email
PASSWORD = "votre_mot_de_passe"  # Remplacez par votre mot de passe


# =============================================================================
# FONCTIONS PRINCIPALES
# =============================================================================

def get_transactions(
    categories: Optional[List[str]] = None,
    transaction_types: Optional[List[str]] = None,
    accounts: Optional[List[str]] = None,
    description_filter: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: str = "value_date",
    min_amount: Optional[float] = None,
    max_amount: Optional[float] = None,
    include_in_stats: Optional[bool] = None,
    limit: int = 1000,
    offset: int = 0,
    sort_by: str = "date",
    sort_order: str = "desc"
) -> dict:
    """
    Récupère les transactions avec filtres optionnels.
    
    Args:
        categories: Liste des catégories à filtrer
        transaction_types: Types de transactions ('expense', 'income', 'transfer')
        accounts: Liste des comptes à filtrer
        description_filter: Mot-clé dans la description
        start_date: Date de début (YYYY-MM-DD)
        end_date: Date de fin (YYYY-MM-DD)
        date_type: Type de date à utiliser ('transaction_date' ou 'value_date')
        min_amount: Montant minimum
        max_amount: Montant maximum
        include_in_stats: Filtrer par inclusion dans les stats
        limit: Nombre max de résultats (max: 5000)
        offset: Décalage pour pagination
        sort_by: Champ de tri ('date', 'amount', 'description')
        sort_order: Ordre de tri ('asc' ou 'desc')
    
    Returns:
        dict: Réponse JSON de l'API
    """
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    }
    
    payload = {
        "email": EMAIL,
        "password": PASSWORD,
        "limit": limit,
        "offset": offset,
        "sort_by": sort_by,
        "sort_order": sort_order,
        "date_type": date_type
    }
    
    # Ajouter les filtres optionnels
    if categories:
        payload["categories"] = categories
    if transaction_types:
        payload["transaction_types"] = transaction_types
    if accounts:
        payload["accounts"] = accounts
    if description_filter:
        payload["description_filter"] = description_filter
    if start_date:
        payload["start_date"] = start_date
    if end_date:
        payload["end_date"] = end_date
    if min_amount is not None:
        payload["min_amount"] = min_amount
    if max_amount is not None:
        payload["max_amount"] = max_amount
    if include_in_stats is not None:
        payload["include_in_stats"] = include_in_stats
    
    try:
        response = requests.post(API_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.RequestException as e:
        print(f"Erreur lors de la requête: {e}")
        return {"success": False, "error": str(e)}


def get_all_transactions(**kwargs) -> List[dict]:
    """
    Récupère TOUTES les transactions avec pagination automatique.
    
    Args:
        **kwargs: Mêmes arguments que get_transactions()
    
    Returns:
        list: Liste de toutes les transactions
    """
    all_transactions = []
    offset = 0
    limit = kwargs.pop('limit', 1000)
    
    while True:
        data = get_transactions(limit=limit, offset=offset, **kwargs)
        
        if not data.get('success'):
            print(f"Erreur: {data.get('error')}")
            break
        
        all_transactions.extend(data.get('data', []))
        
        if not data.get('pagination', {}).get('has_more', False):
            break
        
        offset += limit
        print(f"  Récupéré {len(all_transactions)} transactions...")
    
    return all_transactions


def export_to_csv(transactions: List[dict], filename: str = "transactions.csv") -> None:
    """
    Exporte les transactions vers un fichier CSV.
    
    Args:
        transactions: Liste des transactions
        filename: Nom du fichier de sortie
    """
    if not transactions:
        print("Aucune transaction à exporter")
        return
    
    headers = [
        'Date Valeur', 'Date Comptable', 'Description', 'Type', 
        'Montant', 'Catégorie', 'Compte', 'Inclus Stats'
    ]
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        
        for tx in transactions:
            writer.writerow([
                tx.get('value_date', ''),
                tx.get('transaction_date', ''),
                tx.get('description', ''),
                tx.get('type', ''),
                tx.get('amount', 0),
                tx.get('categories', {}).get('name', 'N/A') if tx.get('categories') else 'N/A',
                tx.get('accounts', {}).get('name', 'N/A') if tx.get('accounts') else 'N/A',
                'Oui' if tx.get('include_in_stats') else 'Non'
            ])
    
    print(f"✅ Exporté {len(transactions)} transactions vers {filename}")


def print_summary(data: dict) -> None:
    """Affiche un résumé des données récupérées."""
    if not data.get('success'):
        print(f"❌ Erreur: {data.get('error')}")
        return
    
    summary = data.get('summary', {})
    pagination = data.get('pagination', {})
    
    print("\n" + "=" * 50)
    print("📊 RÉSUMÉ DES TRANSACTIONS")
    print("=" * 50)
    
    print(f"\n📈 Statistiques générales:")
    print(f"  • Total transactions: {summary.get('total_transactions', 0)}")
    print(f"  • Retournées: {summary.get('returned_transactions', 0)}")
    print(f"  • Dépenses: {summary.get('expense_count', 0)}")
    print(f"  • Revenus: {summary.get('income_count', 0)}")
    print(f"  • Transferts: {summary.get('transfer_count', 0)}")
    
    print(f"\n💰 Montants:")
    print(f"  • Total dépenses: {summary.get('total_expenses', 0):.2f}€")
    print(f"  • Total revenus: {summary.get('total_income', 0):.2f}€")
    print(f"  • Total transferts: {summary.get('total_transfers', 0):.2f}€")
    print(f"  • Frais de transfert: {summary.get('total_transfer_fees', 0):.2f}€")
    print(f"  • Net: {summary.get('net_total', 0):.2f}€")
    
    if summary.get('by_category'):
        print(f"\n📁 Par catégorie:")
        for cat in summary['by_category']:
            print(f"  • {cat['category']}: {cat['count']} tx, {cat['expenses']:.2f}€ dépenses, {cat['income']:.2f}€ revenus")
    
    if summary.get('by_account'):
        print(f"\n🏦 Par compte:")
        for acc in summary['by_account']:
            print(f"  • {acc['account']}: {acc['count']} tx")
    
    if pagination.get('has_more'):
        print(f"\n⚠️  Il y a plus de transactions disponibles (total: {pagination.get('total', 0)})")


# =============================================================================
# EXEMPLES D'UTILISATION
# =============================================================================

if __name__ == "__main__":
    print("🚀 JMRVY CB - API Client\n")
    
    # -------------------------------------------------------------------------
    # Exemple 1: Récupérer toutes les transactions du mois en cours
    # -------------------------------------------------------------------------
    print("=" * 50)
    print("Exemple 1: Transactions du mois en cours")
    print("=" * 50)
    
    today = datetime.now()
    first_day = today.replace(day=1).strftime("%Y-%m-%d")
    
    data = get_transactions(
        start_date=first_day,
        end_date=today.strftime("%Y-%m-%d")
    )
    print_summary(data)
    
    # -------------------------------------------------------------------------
    # Exemple 2: Dépenses d'une catégorie spécifique
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("Exemple 2: Dépenses Alimentation")
    print("=" * 50)
    
    data = get_transactions(
        categories=["Alimentation"],
        transaction_types=["expense"],
        start_date="2024-01-01"
    )
    print_summary(data)
    
    # -------------------------------------------------------------------------
    # Exemple 3: Recherche par description
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("Exemple 3: Recherche 'Netflix'")
    print("=" * 50)
    
    data = get_transactions(description_filter="Netflix")
    
    if data.get('success') and data.get('data'):
        print(f"\nTransactions trouvées:")
        for tx in data['data'][:5]:  # Afficher les 5 premières
            print(f"  {tx['value_date']} - {tx['description']}: {tx['amount']}€")
    else:
        print("Aucune transaction trouvée")
    
    # -------------------------------------------------------------------------
    # Exemple 4: Grosses dépenses (> 100€)
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("Exemple 4: Grosses dépenses (> 100€)")
    print("=" * 50)
    
    data = get_transactions(
        transaction_types=["expense"],
        min_amount=100,
        sort_by="amount",
        sort_order="desc",
        limit=10
    )
    
    if data.get('success') and data.get('data'):
        print(f"\nTop 10 dépenses > 100€:")
        for tx in data['data']:
            cat = tx.get('categories', {}).get('name', 'N/A') if tx.get('categories') else 'N/A'
            print(f"  {tx['value_date']} - {tx['description'][:30]}: {tx['amount']:.2f}€ ({cat})")
    
    # -------------------------------------------------------------------------
    # Exemple 5: Export CSV complet de l'année
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("Exemple 5: Export CSV de l'année 2024")
    print("=" * 50)
    
    # Décommenter pour exporter:
    # all_tx = get_all_transactions(
    #     start_date="2024-01-01",
    #     end_date="2024-12-31"
    # )
    # export_to_csv(all_tx, "transactions_2024.csv")
    print("(Décommentez le code pour exporter)")
    
    # -------------------------------------------------------------------------
    # Exemple 6: Analyse des investissements
    # -------------------------------------------------------------------------
    print("\n" + "=" * 50)
    print("Exemple 6: Analyse des investissements")
    print("=" * 50)
    
    data = get_transactions(
        categories=["Investissements", "PEA"],
        description_filter="PEA"
    )
    print_summary(data)
