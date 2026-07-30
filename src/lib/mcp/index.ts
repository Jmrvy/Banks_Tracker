import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listAccounts from "./tools/list-accounts";
import listCategories from "./tools/list-categories";
import listTransactions from "./tools/list-transactions";
import listSavingsGoals from "./tools/list-savings-goals";
import listUpcoming from "./tools/list-upcoming";
import spendingSummary from "./tools/spending-summary";
import createTransaction from "./tools/create-transaction";

// The OAuth issuer must be the direct Supabase host, built from the project
// ref that Vite inlines at build time (never from SUPABASE_URL, which may be a
// proxy). The fallback only keeps the URL well-formed during manifest extract.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "spendingtrackerjmrvy",
  title: "spendingtrackerjmrvy",
  version: "0.1.0",
  instructions:
    "Tools for a personal finance tracker. Read the signed-in user's bank accounts, categories, transactions, savings goals and upcoming commitments, summarize spending over a period, and record new income or expense transactions. Amounts are net of refunds. Dates are YYYY-MM-DD.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listAccounts,
    listCategories,
    listTransactions,
    listSavingsGoals,
    listUpcoming,
    spendingSummary,
    createTransaction,
  ],
});
