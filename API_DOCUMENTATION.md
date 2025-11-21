# 📡 API Documentation - Transactions d'Investissements

## Vue d'ensemble

Cette API vous permet de récupérer vos transactions d'investissements depuis votre application de finance personnelle via n'importe quel programme externe (Python, Node.js, curl, etc.).

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

### Body (JSON)
```json
{
  "email": "votre.email@example.com",
  "password": "votre_mot_de_passe",
  "categories": ["Investissements", "PEA"],  // Optionnel
  "description_filter": "PEA",                // Optionnel - recherche dans la description
  "start_date": "2024-01-01",                 // Optionnel (YYYY-MM-DD)
  "end_date": "2024-12-31"                    // Optionnel (YYYY-MM-DD)
}
```

### Paramètres

| Paramètre | Type | Requis | Description |
|-----------|------|--------|-------------|
| `email` | string | ✅ Oui | Votre email de connexion Supabase |
| `password` | string | ✅ Oui | Votre mot de passe Supabase |
| `categories` | array | ❌ Non | Liste des noms de catégories à filtrer |
| `description_filter` | string | ❌ Non | Mot-clé à rechercher dans la description (insensible à la casse) |
| `start_date` | string | ❌ Non | Date de début (format YYYY-MM-DD) |
| `end_date` | string | ❌ Non | Date de fin (format YYYY-MM-DD) |

## 📤 Réponse

### Succès (200)
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "description": "Achat actions XYZ",
      "amount": 1000.00,
      "type": "expense",
      "transaction_date": "2024-01-15",
      "value_date": "2024-01-15",
      "created_at": "2024-01-15T10:30:00Z",
      "category_id": "uuid",
      "categories": {
        "id": "uuid",
        "name": "Investissements",
        "color": "#3B82F6"
      },
      "account_id": "uuid",
      "accounts": {
        "id": "uuid",
        "name": "Compte Principal",
        "account_type": "checking"
      }
    }
  ],
  "summary": {
    "total_transactions": 42,
    "total_amount": 15750.50,
    "categories": ["Investissements", "PEA"]
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

### Python (avec requests)
```python
import requests

API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions"
API_KEY = "votre_cle_api"

headers = {
    "Content-Type": "application/json",
    "x-api-key": API_KEY
}

payload = {
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "categories": ["Investissements", "PEA"],
    "description_filter": "PEA"  # Filtre par description
}

response = requests.post(API_URL, headers=headers, json=payload)
data = response.json()

print(f"Transactions: {data['summary']['total_transactions']}")
print(f"Montant total: {data['summary']['total_amount']}")
```

### cURL
```bash
curl -X POST \
  https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions \
  -H "Content-Type: application/json" \
  -H "x-api-key: VOTRE_CLE_API" \
  -d '{
    "email": "votre.email@example.com",
    "password": "votre_mot_de_passe",
    "categories": ["Investissements", "PEA"],
    "description_filter": "PEA",
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
  }'
```

### Node.js (avec fetch)
```javascript
const API_URL = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions";
const API_KEY = "votre_cle_api";

async function getTransactions() {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    },
    body: JSON.stringify({
      email: "votre.email@example.com",
      password: "votre_mot_de_passe",
      categories: ["Investissements", "PEA"],
      description_filter: "PEA"
    })
  });
  
  const data = await response.json();
  console.log(`Total: ${data.summary.total_amount}€`);
  return data;
}

getTransactions();
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
SUPABASE_EMAIL=votre.email@example.com
SUPABASE_PASSWORD=votre_mot_de_passe
```

```python
import os
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.getenv('API_KEY')
EMAIL = os.getenv('SUPABASE_EMAIL')
PASSWORD = os.getenv('SUPABASE_PASSWORD')
```

## 📊 Cas d'usage

### 1. Récupérer toutes les transactions d'investissements
```python
payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "categories": ["Investissements", "PEA"]
}
```

### 2. Transactions PEA uniquement (filtre par description)
```python
payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "categories": ["Investissements"],
    "description_filter": "PEA"  # Recherche "PEA" dans la description
}
```

### 3. Transactions du dernier mois avec filtre
```python
from datetime import datetime, timedelta

today = datetime.now()
last_month = today - timedelta(days=30)

payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "categories": ["Investissements"],
    "description_filter": "PEA",
    "start_date": last_month.strftime("%Y-%m-%d"),
    "end_date": today.strftime("%Y-%m-%d")
}
```

### 4. Analyse annuelle
```python
payload = {
    "email": EMAIL,
    "password": PASSWORD,
    "categories": ["Investissements", "PEA"],
    "start_date": "2024-01-01",
    "end_date": "2024-12-31"
}
```

## 🚀 Script Python complet

Un script Python d'exemple complet est disponible dans `api_example.py` avec :
- Fonctions pour récupérer les transactions
- Export vers CSV
- Gestion des erreurs
- Exemples d'utilisation

Pour l'utiliser :
```bash
pip install requests
python api_example.py
```

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez que votre clé API est correcte
2. Vérifiez vos credentials Supabase
3. Consultez les logs de l'edge function dans votre dashboard Supabase
4. Vérifiez que les catégories existent dans votre compte

## 📝 Notes

- Les montants sont retournés en tant que nombres
- Les dates sont au format ISO 8601 (YYYY-MM-DD)
- Les catégories sont sensibles à la casse
- Si aucune catégorie n'est spécifiée, toutes les transactions sont retournées
