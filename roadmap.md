# Roadmap

## Foreign-currency subaccounts
- [x] DB: accounts.parent_account_id/currency/initial_fx_rate/fx_rate, transactions.foreign_amount, weighted-average revaluation, balance trigger per leg
- [x] Client: Account model (native balance, market value via live rate), FX rate hook
- [x] Accounts page: subaccounts nested under parent, parent total includes them; create/edit subaccount
- [x] Transaction forms: amounts in the subaccount's currency, conversion transfers with chosen rate
- [x] Transaction lists/details: show native amount next to euro value
- [x] Edge functions / MCP / Trace: currency-aware balances
- [x] Tests for the weighted-average rule
- [x] i18n (fr/en) for all subaccount / currency strings
