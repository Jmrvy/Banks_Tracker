# Banks Tracker — Public API v2

A read-only HTTP API for your Banks Tracker data: transactions, accounts, categories, recurring transactions, and period summaries. Usable from any language that can `POST` JSON (Python, Node.js, curl, Go, etc.).

- **Base URL:** `https://cuanladihtpvkmjhvrln.supabase.co/functions/v1`
- **Protocol:** HTTPS, JSON in / JSON out
- **Method:** `POST` (every endpoint)
- **Version:** `2.0` (every response includes `"version": "2.0"`)

---

## Table of contents

1. [Authentication](#authentication)
2. [Response envelope](#response-envelope)
3. [Endpoints](#endpoints)
   - [`/api-auth` — Get a session token](#api-auth)
   - [`/get-investment-transactions` — List transactions](#get-investment-transactions)
   - [`/get-accounts` — List accounts](#get-accounts)
   - [`/get-categories` — List categories (with budgets & optional spending)](#get-categories)
   - [`/get-recurring` — List recurring transactions](#get-recurring)
   - [`/get-summary` — Period summary](#get-summary)
4. [Error codes](#error-codes)
5. [Usage examples](#usage-examples)
6. [Security & best practices](#security)
7. [Migration from v1](#migration)

---

## Authentication

Every request needs:

- `x-api-key` header — the shared secret you configured when setting up the API
- Either of:
  - `email` + `password` in the JSON body (simple, but slower: re-authenticates each time), or
  - `session_token` in the JSON body (recommended: call `/api-auth` once, reuse the token for ~1 hour)

```http
POST /functions/v1/<endpoint>
Content-Type: application/json
x-api-key: YOUR_API_KEY

{
  "session_token": "eyJhbG...",
  "...other fields..."
}
```

Session tokens respect your Row Level Security policies. No request ever runs under `service_role`.

---

## Response envelope

All endpoints return a consistent shape:

```json
{
  "success": true,
  "version": "2.0",
  "data": [ ... ],
  "summary": { ... },
  "pagination": { ... },       // transactions endpoint only
  "filters_applied": { ... }   // transactions endpoint only
}
```

On failure:

```json
{
  "success": false,
  "version": "2.0",
  "error": {
    "code": "invalid_credentials",
    "message": "Email or password is incorrect"
  }
}
```

---

## Endpoints

### <a id="api-auth"></a>`POST /api-auth` — Get a session token

Exchange your credentials for a short-lived access token (and a refresh token). Reuse the access token on every other endpoint as `session_token`.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | conditional | Required if `refresh_token` not provided |
| `password` | string | conditional | Required if `refresh_token` not provided |
| `refresh_token` | string | optional | Refresh an existing session instead |

**Response `data`**

```json
{
  "success": true,
  "version": "2.0",
  "session_token": "eyJhbGciOi...",
  "refresh_token": "v1.xxx...",
  "expires_at": 1714579200,
  "user": { "id": "uuid", "email": "you@example.com" }
}
```

---

### <a id="get-investment-transactions"></a>`POST /get-investment-transactions` — List transactions

*Historical name, but returns **all** transactions, filtered by the criteria you provide.*

**Request body**

All filters are optional. Authentication fields are as above.

| Field | Type | Default | Description |
|---|---|---|---|
| `transaction_ids` | string[] | — | Fetch specific transactions by id |
| `categories` | string[] | — | Filter by category name (exact match) |
| `transaction_types` | string[] | — | Any of `"expense"`, `"income"`, `"transfer"` |
| `accounts` | string[] | — | Filter by account name |
| `description_filter` | string | — | Case-insensitive substring match |
| `start_date` / `end_date` | string (YYYY-MM-DD) | — | Inclusive range |
| `date_type` | string | `"value_date"` | `"transaction_date"` (alias: `"accounting_date"`) or `"value_date"` |
| `include_in_stats` | boolean | — | If set, restrict to matching rows |
| `has_refund` | boolean | — | `true` = only refunded; `false` = only not-refunded |
| `min_amount` / `max_amount` | number | — | Inclusive bounds on gross amount |
| `limit` | number | 1000 | Max 5000 |
| `offset` | number | 0 | Pagination offset |
| `sort_by` | string | `"date"` | `"date"`, `"amount"`, or `"description"` |
| `sort_order` | string | `"desc"` | `"asc"` or `"desc"` |

**Response highlights**

- Each transaction includes both `amount` (gross) and `net_amount` (`amount - refunded_amount` for expenses).
- `summary.total_expenses` is **net of refunds**; `summary.gross_expenses` and `summary.refunded_amount` are separate.
- `summary.income_count` and `summary.total_income` exclude income rows that are refund entries.

```json
{
  "success": true,
  "version": "2.0",
  "data": [ { "id": "...", "amount": 120, "refunded_amount": 20, "net_amount": 100, "type": "expense", "categories": { ... }, "accounts": { ... } } ],
  "summary": {
    "total_transactions": 150,
    "returned_transactions": 100,
    "gross_expenses": 2600,
    "refunded_amount": 100,
    "total_expenses": 2500,
    "total_income": 3500,
    "total_transfer_fees": 5,
    "net_total": 995,
    "by_category": [ { "category": "Alimentation", "count": 45, "expenses": 850, "refunded": 0, "income": 0 } ],
    "by_account":  [ { "account": "Compte Principal", "count": 90, "expenses": 2000, "income": 3500, "transfers": 500 } ]
  },
  "pagination": { "limit": 100, "offset": 0, "total": 150, "returned": 100, "has_more": true },
  "filters_applied": { ... }
}
```

---

### <a id="get-accounts"></a>`POST /get-accounts` — List accounts

**Request body**

| Field | Type | Description |
|---|---|---|
| `account_types` | string[] | Any of `"checking"`, `"savings"`, `"credit"`, `"investment"` |
| `banks` | string[] | Filter by bank key (e.g. `"boursorama"`) |

**Response**

```json
{
  "success": true,
  "version": "2.0",
  "data": [ { "id": "...", "name": "Compte Principal", "bank": "boursorama", "account_type": "checking", "balance": 1234.56, "currency": "EUR" } ],
  "summary": {
    "total_accounts": 4,
    "total_balance": 8421.00,
    "by_type": [ { "type": "checking", "count": 1, "total": 1234.56 } ]
  }
}
```

---

### <a id="get-categories"></a>`POST /get-categories` — List categories

Returns all categories. If `period_start`/`period_end` are set, each category also gets `period_spent`, `period_refunded`, `period_net_spent`, and `remaining_budget`.

**Request body**

| Field | Type | Description |
|---|---|---|
| `period_start` / `period_end` | YYYY-MM-DD | Optional period to compute spending for |
| `date_type` | string | `"value_date"` (default) or `"transaction_date"`/`"accounting_date"` |

**Response**

```json
{
  "success": true,
  "version": "2.0",
  "data": [
    {
      "id": "...", "name": "Alimentation", "color": "#22C55E", "budget": 400,
      "period_spent": 385.20, "period_refunded": 12, "period_net_spent": 373.20, "remaining_budget": 26.80
    }
  ],
  "summary": { "total_categories": 12, "categories_with_budget": 6, "total_monthly_budget": 1800 }
}
```

---

### <a id="get-recurring"></a>`POST /get-recurring` — List recurring transactions

Each row has a `monthly_equivalent` field so you can directly sum monthly cashflow regardless of recurrence type.

**Request body**

| Field | Type | Description |
|---|---|---|
| `active_only` | boolean | Exclude paused recurring |
| `types` | string[] | `"expense"` and/or `"income"` |
| `categories` | string[] | Filter by category name |

**Response**

```json
{
  "success": true,
  "version": "2.0",
  "data": [
    { "id": "...", "description": "Salaire MAM ({MM}.{YY})", "amount": 2570, "recurrence_type": "monthly",
      "next_due_date": "2026-05-01", "is_active": true, "monthly_equivalent": 2570,
      "categories": { ... }, "accounts": { ... } }
  ],
  "summary": {
    "total": 20, "active": 15, "inactive": 5,
    "monthly_income": 2570, "monthly_expenses": 1303.41, "monthly_net": 1266.59,
    "yearly_income": 30840, "yearly_expenses": 15640.92, "yearly_net": 15199.08
  }
}
```

---

### <a id="get-summary"></a>`POST /get-summary` — Period summary

One call for a whole dashboard: balances + income/expenses + top categories + monthly breakdown.

**Request body**

| Field | Type | Required | Description |
|---|---|---|---|
| `period_start` | YYYY-MM-DD | ✅ | Inclusive |
| `period_end` | YYYY-MM-DD | ✅ | Inclusive |
| `date_type` | string | — | Same options as other endpoints |

**Response**

```json
{
  "success": true,
  "version": "2.0",
  "period": { "start": "2026-01-01", "end": "2026-12-31", "date_type": "value_date" },
  "balances": {
    "current_total": 8421.00,
    "by_account": [ { "account": "Compte Principal", "type": "checking", "balance": 1234.56, "currency": "EUR" } ]
  },
  "totals": {
    "income": 30840, "expenses": 15640.92, "refunded": 120, "transfer_fees": 0,
    "net": 15199.08, "transaction_count": 312
  },
  "top_categories": [ { "name": "Loyer", "amount": 7200 }, { "name": "Alimentation", "amount": 4521.30 } ],
  "monthly_breakdown": [ { "month": "2026-01", "income": 2570, "expenses": 1303.41, "net": 1266.59 } ]
}
```

---

## <a id="error-codes"></a>Error codes

| HTTP | `error.code` | Meaning |
|---|---|---|
| 400 | `invalid_json` | Body is not valid JSON |
| 400 | `missing_credentials` | No `session_token` and no `email`/`password` |
| 400 | `missing_period` | Required `period_start` / `period_end` missing |
| 401 | `invalid_api_key` | `x-api-key` missing or wrong |
| 401 | `invalid_credentials` | Wrong email or password |
| 401 | `invalid_session` | `session_token` expired or invalid |
| 401 | `invalid_refresh` | `refresh_token` invalid or expired |
| 405 | `method_not_allowed` | Use POST |
| 500 | `query_failed` | Upstream database error (see `details`) |

---

## <a id="usage-examples"></a>Usage examples

### Python — recommended flow with session token

```python
import os, requests

BASE = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1"
HEADERS = {"Content-Type": "application/json", "x-api-key": os.environ["API_KEY"]}

# 1) Authenticate once, reuse the token.
auth = requests.post(f"{BASE}/api-auth", headers=HEADERS, json={
    "email": os.environ["JMRVY_EMAIL"],
    "password": os.environ["JMRVY_PASSWORD"],
}).json()
token = auth["session_token"]

# 2) Query with the token.
r = requests.post(f"{BASE}/get-summary", headers=HEADERS, json={
    "session_token": token,
    "period_start": "2026-01-01",
    "period_end": "2026-12-31",
}).json()

print(f"Income {r['totals']['income']} € — Expenses {r['totals']['expenses']} € — Net {r['totals']['net']} €")
for c in r["top_categories"][:5]:
    print(f"  {c['name']}: {c['amount']} €")
```

### Python — transactions with pagination

```python
def fetch_all(token, filters):
    all_tx, offset, limit = [], 0, 1000
    while True:
        r = requests.post(f"{BASE}/get-investment-transactions",
                          headers=HEADERS,
                          json={"session_token": token, "limit": limit, "offset": offset, **filters}).json()
        all_tx.extend(r["data"])
        if not r["pagination"]["has_more"]:
            return all_tx
        offset += limit

expenses_2026 = fetch_all(token, {
    "transaction_types": ["expense"],
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
})
print(f"{len(expenses_2026)} expense rows")
```

### Python — budget health check

```python
r = requests.post(f"{BASE}/get-categories", headers=HEADERS, json={
    "session_token": token,
    "period_start": "2026-04-01",
    "period_end": "2026-04-30",
}).json()

for c in r["data"]:
    if c.get("budget") and c["period_net_spent"] > c["budget"] * 0.9:
        print(f"⚠️  {c['name']}: {c['period_net_spent']} / {c['budget']} €")
```

### cURL — transactions with multiple filters

```bash
curl -X POST https://cuanladihtpvkmjhvrln.supabase.co/functions/v1/get-investment-transactions \
  -H "Content-Type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "session_token": "'"$TOKEN"'",
    "categories": ["Alimentation", "Transport"],
    "transaction_types": ["expense"],
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
    "has_refund": false,
    "sort_by": "amount",
    "sort_order": "desc",
    "limit": 50
  }'
```

### Node.js — monthly dashboard

```js
const BASE = "https://cuanladihtpvkmjhvrln.supabase.co/functions/v1";
const HEADERS = { "Content-Type": "application/json", "x-api-key": process.env.API_KEY };

async function api(path, body) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: HEADERS, body: JSON.stringify(body) });
  const json = await r.json();
  if (!json.success) throw new Error(`${json.error.code}: ${json.error.message}`);
  return json;
}

const { session_token } = await api("/api-auth", {
  email: process.env.JMRVY_EMAIL,
  password: process.env.JMRVY_PASSWORD,
});

const summary = await api("/get-summary", {
  session_token,
  period_start: "2026-04-01",
  period_end: "2026-04-30",
});

console.log(`Solde total: ${summary.balances.current_total} €`);
console.log(`Top 3:`, summary.top_categories.slice(0, 3));
```

### Python — CSV export of yearly expenses

```python
import csv

all_tx = fetch_all(token, {
    "transaction_types": ["expense"],
    "start_date": "2026-01-01",
    "end_date": "2026-12-31",
})

with open("expenses_2026.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["date", "description", "category", "account", "gross", "refunded", "net"])
    for tx in all_tx:
        w.writerow([
            tx["value_date"], tx["description"],
            (tx.get("categories") or {}).get("name", "N/A"),
            (tx.get("accounts")   or {}).get("name", "N/A"),
            tx["amount"], tx["refunded_amount"], tx["net_amount"],
        ])
```

---

## <a id="security"></a>Security & best practices

- Never commit your `x-api-key` or credentials. Use environment variables or a secret manager.
- Prefer `session_token` over `email`/`password`: shorter-lived, and it doesn't flow through logs on every call.
- Refresh tokens expire less often — call `/api-auth` with `refresh_token` to renew without re-entering a password.
- All queries are scoped by the user's JWT and respect Row Level Security. The API never executes under `service_role`.
- Rotate your API key if you suspect it leaked: set a new `API_KEY` secret in Supabase and update your clients.

---

## <a id="migration"></a>Migration from v1

v1 clients continue to work without changes — the transactions endpoint stays at `/get-investment-transactions` and accepts the same filters. Differences you may notice:

| Area | v1 | v2 |
|---|---|---|
| Auth | `email` + `password` only | Also accepts `session_token` |
| Expense totals | Ignored refunds (`total_expenses = gross`) | Net of refunds (`total_expenses = gross − refunded`) |
| Transaction fields | — | Adds `refunded_amount`, `net_amount`, `refund_of_transaction_id` |
| Error shape | `{ error: "..." }` | `{ success: false, error: { code, message } }` |
| Response | — | Every response includes `"version": "2.0"` |
| Other resources | Not available | `/get-accounts`, `/get-categories`, `/get-recurring`, `/get-summary` |

If your v1 client consumed `total_expenses`, note that it now reflects actual out-of-pocket spending after refunds. Use `gross_expenses` to reproduce the old number.

---

## Support

If you run into trouble:

1. Confirm `x-api-key` matches your configured `API_KEY` secret.
2. If you see `invalid_session`, your token expired (~1 h) — call `/api-auth` again or use `refresh_token`.
3. Inspect the Supabase edge-function logs for the function you called.
4. Remember: dates are `YYYY-MM-DD`, category/account names are case-sensitive and must match exactly.
