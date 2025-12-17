# 📡 API Documentation - Transactions JMRVY CB

## Vue d'ensemble

Cette API vous permet de récupérer et filtrer vos transactions financières depuis votre application JMRVY CB via n'importe quel programme externe (Python, Node.js, curl, etc.).

## 🔐 Authentification

L'API utilise une double authentification pour la sécurité:
1. **API Key** (clé API partagée) - via le header `x-api-key`
2. **Credentials Supabase** (email/password) - via le body de la requête

### Votre API Key
Vous avez créé une clé API unique lors de la configuration. Gardez-la secrète !

## 🌐 Endpoint

```
POST https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions
```

## 📥 Requête

### Headers
```
Content-Type: application/json
x-api-key: VOTRE_CLE_API
```

### Body (JSON) - Tous les paramètres
```json
{
  "email": "votre.email@example.com",
  "password": "votre_mot_de_passe",
  
  "categories": ["Alimentation", "Transport"],
  "transaction_types": ["expense", "income"],
  "accounts": ["Compte Principal", "Compte Épargne"],
  "description_filter": "supermarché",
  
  "start_date": "2024-01-01",
  "end_date": "2024-12-31",
  "date_type": "value_date",
  
  "min_amount": 10,
  "max_amount": 500,
  "include_in_stats": true,
  
  "limit": 100,
  "offset": 0,
  "sort_by": "date",
  "sort_order": "desc"
}
```

### Paramètres de filtrage

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `email` | string | ✅ Oui | Votre email de connexion |
| `password` | string | ✅ Oui | Votre mot de passe |
| `categories` | string[] | ❌ Non | Noms des catégories à filtrer |
| `transaction_types` | string[] | ❌ Non | Types: `expense`, `income`, `transfer` |
| `accounts` | string[] | ❌ Non | Noms des comptes à filtrer |
| `description_filter` | string | ❌ Non | Mot-clé dans la description (insensible à la casse) |
| `start_date` | string | ❌ Non | Date de début (YYYY-MM-DD) |
| `end_date` | string | ❌ Non | Date de fin (YYYY-MM-DD) |
| `date_type` | string | ❌ Non | `transaction_date` ou `value_date` (défaut) |
| `min_amount` | number | ❌ Non | Montant minimum |
| `max_amount` | number | ❌ Non | Montant maximum |
| `include_in_stats` | boolean | ❌ Non | Filtrer par inclusion dans les stats |

### Paramètres de pagination et tri

| Paramètre | Type | Défaut | Description |
|-----------|------|--------|-------------|
| `limit` | number | 1000 | Nombre max de résultats (max: 5000) |
| `offset` | number | 0 | Décalage pour pagination |
| `sort_by` | string | `date` | Tri par: `date`, `amount`, `description` |
| `sort_order` | string | `desc` | Ordre: `asc` ou `desc` |

## 📤 Réponse

### Structure complète

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "description": "Courses supermarché",
      "amount": 85.50,
      "type": "expense",
      "transaction_date": "2024-01-15",
      "value_date": "2024-01-15",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z",
      "include_in_stats": true,
      "transfer_fee": null,
      "transfer_to_account_id": null,
      "category_id": "uuid",
      "categories": {
        "id": "uuid",
        "name": "Alimentation",
        "color": "#22C55E",
        "budget": 400
      },
      "account_id": "uuid",
      "accounts": {
        "id": "uuid",
        "name": "Compte Principal",
        "account_type": "checking",
        "bank": "boursorama"
      }
    }
  ],
  "summary": {
    "total_transactions": 150,
    "returned_transactions": 100,
    "expense_count": 80,
    "income_count": 15,
    "transfer_count": 5,
    "total_expenses": 2500.00,
    "total_income": 3500.00,
    "total_transfers": 500.00,
    "total_transfer_fees": 5.00,
    "net_total": 995.00,
    "categories": ["Alimentation", "Transport", "Loisirs"],
    "accounts": ["Compte Principal", "Compte Épargne"],
    "by_category": [
      {
        "category": "Alimentation",
        "count": 45,
        "total": 850.00,
        "expenses": 850.00,
        "income": 0
      }
    ],
    "by_account": [
      {
        "account": "Compte Principal",
        "count": 90,
        "expenses": 2000.00,
        "income": 3500.00,
        "transfers": 500.00
      }
    ]
  },
  "pagination": {
    "limit": 100,
    "offset": 0,
    "total": 150,
    "returned": 100,
    "has_more": true
  },
  "filters_applied": {
    "categories": ["Alimentation"],
    "transaction_types": ["expense"],
    "accounts": null,
    "description_filter": "supermarché",
    "date_range": {
      "start": "2024-01-01",
      "end": "2024-12-31",
      "date_type": "value_date"
    },
    "amount_range": null,
    "include_in_stats": true,
    "sorting": {
      "sort_by": "date",
      "sort_order": "desc"
    }
  }
}
```

### Erreurs

| Code | Description |
|------|-------------|
| 400 | Paramètres manquants (email/password) |
| 401 | Clé API invalide ou credentials incorrects |
| 500 | Erreur serveur |

## 💻 Exemples d'utilisation

### Python - Récupérer toutes les dépenses d'une catégorie

```python
import requests
from datetime import datetime, timedelta

API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions"
API_KEY = "votre_cle_api"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

# Récupérer toutes les dépenses "Alimentation" du mois dernier
today = datetime.now()
last_month = today - timedelta(days=30)

payload = {
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "categories": ["Alimentation"],
    "transaction_types": ["expense"],
    "start_date": last_month.strftime("%Y-%m-%d"),
    "end_date": today.strftime("%Y-%m-%d")
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

print(f"Dépenses Alimentation: {data['summary']['total_expenses']}€")
print(f"Nombre de transactions: {data['summary']['expense_count']}")
```

### Python - Rechercher par description

```python
# Trouver toutes les transactions contenant "Netflix"
payload = {
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "description_filter": "Netflix"
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

for tx in data['data']:
    print(f"{tx['transaction_date']} - {tx['description']}: {tx['amount']}€")
```

### Python - Analyser les revenus par compte

```python
# Récupérer tous les revenus
payload = {
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "transaction_types": ["income"],
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

print("Revenus par compte:")
for account in data['summary']['by_account']:
    print(f"  {account['account']}: {account['income']}€")
```

### Python - Pagination pour grandes quantités

```python
def get_all_transactions(payload_base, headers):
    """Récupère toutes les transactions avec pagination"""
    all_transactions = []
    offset = 0
    limit = 1000
    
    while True:
        payload = {**payload_base, "limit": limit, "offset": offset}
        response = requests.post(API_URL, headers=headers, json=payload)
        data = response.json()
        
        all_transactions.extend(data['data'])
        
        if not data['pagination']['has_more']:
            break
        
        offset += limit
    
    return all_transactions

# Utilisation
payload_base = {
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "start_date": "2024-01-01"
}

all_tx = get_all_transactions(payload_base, headers)
print(f"Total: {len(all_tx)} transactions")
```

### cURL - Filtres multiples

```bash
curl -X POST \
  https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions \
  -H "Content-Type: application/json" \
  -H "x-api-key: VOTRE_CLE_API" \
  -d '{
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "categories": ["Alimentation", "Transport"],
    "transaction_types": ["expense"],
    "accounts": ["Compte Principal"],
    "min_amount": 50,
    "max_amount": 200,
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "sort_by": "amount",
    "sort_order": "desc",
    "limit": 50
  }'
```

### Node.js - Analyse mensuelle

```javascript
const API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions";
const API_KEY = "votre_cle_api";

async function getMonthlyAnalysis(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${lastDay}`;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({
      email: "votre.email@example.com",
      password: "votre_mot_de_passe",
      start_date: startDate,
      end_date: endDate
    })
  });
  
  const data = await response.json();
  
  console.log(`\n=== Analyse ${month}/${year} ===`);
  console.log(`Revenus: ${data.summary.total_income}€`);
  console.log(`Dépenses: ${data.summary.total_expenses}€`);
  console.log(`Net: ${data.summary.net_total}€`);
  console.log(`\nPar catégorie:`);
  data.summary.by_category.forEach(cat => {
    console.log(`  ${cat.category}: ${cat.expenses}€ dépensés, ${cat.income}€ revenus`);
  });
  
  return data;
}

// Analyse de janvier 2024
getMonthlyAnalysis(2024, 1);
```

## 📊 Cas d'usage avancés

### 1. Export CSV de toutes les dépenses

```python
import csv
import requests

payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "transaction_types": ["expense"],
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "limit": 5000
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

with open('depenses_2024.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(['Date', 'Description', 'Catégorie', 'Montant', 'Compte'])
    
    for tx in data['data']:
        writer.writerow([
            tx['value_date'],
            tx['description'],
            tx['categories']['name'] if tx['categories'] else 'N/A',
            tx['amount'],
            tx['accounts']['name'] if tx['accounts'] else 'N/A'
        ])

print(f"Exporté {len(data['data'])} transactions")
```

### 2. Suivi des investissements PEA

```python
payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "categories": ["Investissements", "PEA"],
    "description_filter": "PEA"
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

total_investi = sum(tx['amount'] for tx in data['data'] if tx['type'] == 'expense')
total_dividendes = sum(tx['amount'] for tx in data['data'] if tx['type'] == 'income')

print(f"Total investi: {total_investi}€")
print(f"Dividendes reçus: {total_dividendes}€")
```

### 3. Alertes de dépenses importantes

```python
# Trouver les dépenses > 500€ du mois
from datetime import datetime

today = datetime.now()
first_day = today.replace(day=1).strftime("%Y-%m-%d")

payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "transaction_types": ["expense"],
    "min_amount": 500,
    "start_date": first_day,
    "sort_by": "amount",
    "sort_order": "desc"
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

print("Dépenses importantes ce mois:")
for tx in data['data']:
    print(f"  - {tx['description']}: {tx['amount']}€ ({tx['categories']['name'] if tx['categories'] else 'N/A'})")
```

## 🔒 Sécurité

### Bonnes pratiques
- ⚠️ **Ne partagez jamais votre clé API publiquement**
- 🔐 Stockez vos credentials dans des variables d'environnement
- 🔄 Changez régulièrement votre mot de passe
- 📝 Surveillez les logs d'accès à l'API

### Variables d'environnement (recommandé)
```bash
# Fichier .env
API_KEY=votre_cle_api
JMRVY_EMAIL=votre.email@example.com
JMRVY_PASSWORD=votre_mot_de_passe
```

```python
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('API_KEY')
EMAIL = os.getenv('JMRVY_EMAIL')
PASSWORD = os.getenv('JMRVY_PASSWORD')
```

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez que votre clé API est correcte
2. Vérifiez vos credentials
3. Consultez les logs de l'edge function dans Supabase
4. Vérifiez que les catégories/comptes existent dans votre compte
5. Vérifiez le format des dates (YYYY-MM-DD)

## 📝 Notes

- Les montants sont arrondis à 2 décimales
- Les dates sont au format ISO 8601 (YYYY-MM-DD)
- Les noms de catégories et comptes sont sensibles à la casse
- Sans filtre, toutes les transactions sont retournées (limite: 1000 par défaut)
- Utilisez la pagination pour récupérer plus de 1000 transactions
