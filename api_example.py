"""
Script Python pour récupérer les transactions d'investissements via l'API
"""
import requests
import json
from datetime import datetime, timedelta

# Configuration
API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions"
API_KEY = "VOTRE_CLE_API_ICI"  # Remplacez avec la clé API que vous avez créée
EMAIL = "votre.email@example.com"  # Votre email Supabase
PASSWORD = "votre_mot_de_passe"  # Votre mot de passe Supabase

def get_investment_transactions(
    categories=None,
    description_filter=None,
    start_date=None,
    end_date=None
):
    """
    Récupère les transactions d'investissements depuis l'API
    
    Args:
        categories (list, optional): Liste des catégories à filtrer (ex: ["Investissements", "PEA"])
        description_filter (str, optional): Mot-clé à rechercher dans la description (ex: "PEA")
        start_date (str, optional): Date de début au format YYYY-MM-DD
        end_date (str, optional): Date de fin au format YYYY-MM-DD
    
    Returns:
        dict: Réponse de l'API contenant les transactions et le résumé
    """
    
    # Préparer les headers
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    }
    
    # Préparer le body de la requête
    payload = {
        "email": EMAIL,
        "password": PASSWORD
    }
    
    # Ajouter les filtres optionnels
    if categories:
        payload["categories"] = categories
    if description_filter:
        payload["description_filter"] = description_filter
    if start_date:
        payload["start_date"] = start_date
    if end_date:
        payload["end_date"] = end_date
    
    try:
        # Faire la requête POST
        response = requests.post(API_URL, headers=headers, json=payload)
        
        # Vérifier le statut de la réponse
        if response.status_code == 200:
            data = response.json()
            print(f"✅ Succès! {data['summary']['total_transactions']} transactions récupérées")
            print(f"   Montant total: {data['summary']['total_amount']:.2f} €")
            print(f"   Catégories: {', '.join(data['summary']['categories'])}")
            return data
        else:
            print(f"❌ Erreur {response.status_code}: {response.text}")
            return None
            
    except Exception as e:
        print(f"❌ Erreur lors de la requête: {str(e)}")
        return None


def export_to_csv(transactions, filename="transactions.csv"):
    """
    Exporte les transactions vers un fichier CSV
    
    Args:
        transactions (list): Liste des transactions
        filename (str): Nom du fichier de sortie
    """
    import csv
    
    if not transactions:
        print("Aucune transaction à exporter")
        return
    
    with open(filename, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        
        # En-têtes
        writer.writerow([
            'ID', 'Date', 'Description', 'Montant', 'Type',
            'Catégorie', 'Compte', 'Date de création'
        ])
        
        # Données
        for tx in transactions:
            writer.writerow([
                tx['id'],
                tx['value_date'],
                tx['description'],
                tx['amount'],
                tx['type'],
                tx['categories']['name'] if tx.get('categories') else '',
                tx['accounts']['name'] if tx.get('accounts') else '',
                tx['created_at']
            ])
    
    print(f"✅ Transactions exportées vers {filename}")


# Exemples d'utilisation

if __name__ == "__main__":
    print("=" * 60)
    print("API TRANSACTIONS INVESTISSEMENTS")
    print("=" * 60)
    print()
    
    # Exemple 1: Récupérer toutes les transactions "Investissements" et "PEA"
    print("📊 Exemple 1: Toutes les transactions Investissements et PEA")
    result = get_investment_transactions(
        categories=["Investissements", "PEA"]
    )
    
    if result:
        print(f"\nPremière transaction:")
        if result['data']:
            tx = result['data'][0]
            print(f"  - {tx['value_date']}: {tx['description']} - {tx['amount']}€")
    
    print("\n" + "-" * 60 + "\n")
    
    # Exemple 2: Récupérer uniquement les transactions PEA
    print("📊 Exemple 2: Transactions PEA uniquement (filtre par description)")
    result = get_investment_transactions(
        categories=["Investissements"],
        description_filter="PEA"  # Recherche "PEA" dans la description
    )
    
    if result and result['data']:
        print(f"\nPremière transaction PEA:")
        tx = result['data'][0]
        print(f"  - {tx['value_date']}: {tx['description']} - {tx['amount']}€")
    
    print("\n" + "-" * 60 + "\n")
    
    # Exemple 3: Récupérer les transactions du dernier mois
    print("📊 Exemple 3: Transactions PEA du dernier mois")
    today = datetime.now()
    last_month = today - timedelta(days=30)
    
    result = get_investment_transactions(
        categories=["Investissements"],
        description_filter="PEA",
        start_date=last_month.strftime("%Y-%m-%d"),
        end_date=today.strftime("%Y-%m-%d")
    )
    
    print("\n" + "-" * 60 + "\n")
    
    # Exemple 4: Exporter vers CSV
    print("📊 Exemple 4: Export vers CSV")
    result = get_investment_transactions(
        categories=["Investissements"],
        description_filter="PEA"
    )
    
    if result and result.get('data'):
        export_to_csv(result['data'], "mes_investissements.csv")
    
    print("\n" + "=" * 60)
    print("✨ Script terminé!")
    print("=" * 60)
