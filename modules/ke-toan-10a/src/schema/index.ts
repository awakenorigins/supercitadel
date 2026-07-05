/**
 * Điểm export tập trung toàn bộ schema Kế Toán 10A.
 * SuperCitadel core import từ đây qua "@citadel/mod-ketoan10a/schema".
 */
export * from "./_shared.js";
export * from "./accounts.js";
export * from "./contacts.js";
export * from "./journals.js";
export * from "./documents.js";
export * from "./fiscal.js";
export * from "./advances.js";
export * from "./recurring.js";
export * from "./dimensions.js";
export * from "./bank.js";
export * from "./assets.js";
export * from "./budgets.js";
export * from "./audit.js";

// Gom tất cả bảng để tiện truyền vào drizzle({ schema }).
import { accounts, accountsRelations } from "./accounts.js";
import { contacts, contactsRelations } from "./contacts.js";
import {
  journalEntries,
  journalEntriesRelations,
  journalLines,
  journalLinesRelations,
} from "./journals.js";
import { bills, invoices, payments, receipts } from "./documents.js";
import { auditLog, docCounters } from "./audit.js";
import { fiscalYears, fiscalYearsRelations } from "./fiscal.js";
import { advances, advancesRelations } from "./advances.js";
import { recurringTemplates, recurringTemplatesRelations } from "./recurring.js";
import { costCenters, costCentersRelations } from "./dimensions.js";
import { bankTransactions, bankTransactionsRelations, bankRules, bankRulesRelations } from "./bank.js";
import { fixedAssets, fixedAssetsRelations } from "./assets.js";
import { budgets, budgetsRelations } from "./budgets.js";

export const schema = {
  accounts,
  accountsRelations,
  contacts,
  contactsRelations,
  journalEntries,
  journalEntriesRelations,
  journalLines,
  journalLinesRelations,
  receipts,
  payments,
  invoices,
  bills,
  fiscalYears,
  fiscalYearsRelations,
  advances,
  advancesRelations,
  recurringTemplates,
  recurringTemplatesRelations,
  costCenters,
  costCentersRelations,
  bankTransactions,
  bankTransactionsRelations,
  bankRules,
  bankRulesRelations,
  fixedAssets,
  fixedAssetsRelations,
  budgets,
  budgetsRelations,
  auditLog,
  docCounters,
};
