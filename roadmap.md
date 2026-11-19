# Roadmap

## Foreign-currency subaccounts
- [ ] DB: accounts.parent_account_id/currency/initial_fx_rate/fx_rate, transactions.foreign_amount, weighted-average revaluation, balance trigger per leg
- [ ] Client: Account model (native balance, market value via live rate), FX rate hook
- [ ] Accounts page: subaccounts nested under parent, parent total includes them; create/edit subaccount
- [ ] Transaction forms: amounts in the subaccount's currency, conversion transfers with chosen rate
- [ ] Transaction lists/details: show native amount next to euro value
- [ ] Edge functions / MCP / Trace: currency-aware balances
- [ ] Tests for the weighted-average rule
