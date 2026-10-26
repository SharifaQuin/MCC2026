// Server-side stripping for the pricing/quotes tool's HTML, so a non-ADMIN
// response never contains the Profitability & Performance tab or any
// internal margin/cost-floor/assumption content in the first place — never
// shipped-then-hidden with CSS/JS, and never gated by a client-side role
// check that trusts anything the browser sends.
//
// src/content/sales-pricing-tool.html marks every owner-only region with a
// matching pair of sentinel comments: `<!-- ADMIN-ONLY:START -->` /
// `<!-- ADMIN-ONLY:END -->` for HTML, `/* ADMIN-ONLY:START */` /
// `/* ADMIN-ONLY:END */` for inline script. An ADMIN session gets the file
// verbatim (the markers are inert comments); every other authorized Sales
// viewer gets everything between each matched pair removed outright. The
// two still-shared core functions that reference the owner-only elements
// (switchTab's tab/tabbtn-profit toggles, and the price-calculation
// function's ledger/margin/floor/schedule writes) are themselves guarded
// in the source with `?.` / an element-existence check, so removing these
// regions here never leaves a dangling reference that would throw and
// break the calculator for a non-admin viewer.
const HTML_MARKER = /<!-- ADMIN-ONLY:START -->[\s\S]*?<!-- ADMIN-ONLY:END -->/g;
const SCRIPT_MARKER = /\/\* ADMIN-ONLY:START \*\/[\s\S]*?\/\* ADMIN-ONLY:END \*\//g;

export function renderSalesPricingToolHtml(rawHtml: string, isAdmin: boolean): string {
  if (isAdmin) return rawHtml;
  return rawHtml.replace(HTML_MARKER, "").replace(SCRIPT_MARKER, "");
}

// Storage keys the pricing tool's internal Profitability page reads/writes
// (job/route profitability records, the audit log, and its cost-settings
// snapshot) — ADMIN-only for both read and write, regardless of what
// `op` the generic /api/sales/storage endpoint is asked to perform. Sales
// goal/actuals (item 1's concern) are a separate, narrower restriction
// enforced the same way, but only for writes — their reads stay open to
// any authorized Sales viewer.
const PROFIT_KEY_PREFIX = "mcc:profit:";

export function isProfitabilityStorageKey(key: string): boolean {
  return key.startsWith(PROFIT_KEY_PREFIX);
}

const SALES_FINANCIAL_WRITE_KEYS = [/^sales:goal$/, /^sales:actuals:/];

export function isSalesFinancialWriteKey(key: string): boolean {
  return SALES_FINANCIAL_WRITE_KEYS.some((pattern) => pattern.test(key));
}

// sales:actuals:<month> stores {revenue, labor} together — labor (and the
// profit derived from it) is owner-only to READ, unlike the goal/actuals
// write restriction above. There is no legitimate non-admin consumer of
// this key through the generic storage endpoint today, so denying the read
// outright (same as isProfitabilityStorageKey's reads) is the safe default.
const SALES_ACTUALS_STORAGE_KEY = /^sales:actuals:/;

export function isSalesActualsStorageKey(key: string): boolean {
  return SALES_ACTUALS_STORAGE_KEY.test(key);
}
