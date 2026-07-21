// ── Credit Account ──

export type CreditAccountType = "monthly" | "permanent";

export interface CreditAccount {
  id: string; // UUID
  userId: string; // UUID
  type: CreditAccountType;
  availableCredits: number;
  effectiveFrom: number | null; // Unix seconds; null for permanent
  expiredAt: number | null; // Unix seconds; null for permanent
  updatedAt: number; // Unix seconds
}

// ── Credit Ledger ──

export type CreditLedgerType = "grant" | "charge" | "refund" | "recall";

export type CreditReferenceType = "subscription" | "admin" | "ai-session";

export interface CreditLedger {
  id: string; // UUID
  userId: string; // UUID
  type: CreditLedgerType;
  creditsDelta: number; // positive = add, negative = deduct
  referenceType: CreditReferenceType;
  referenceId: string; // UUID
  creditAccountId: string; // UUID → credit_accounts.id
  createdAt: number; // Unix seconds
}

// ── Constants ──

export const MONTHLY_CREDIT_AMOUNT = 300; // Fixed monthly credit amount

// ── Grant / Recall input shapes (used by service) ──

export interface MonthlyGrantInput {
  userId: string;
  year: number;
  month: number; // 1–12
}

export interface PermanentGrantInput {
  userId: string;
  credits: number;
}

export interface MonthlyRecallInput {
  userId: string;
  creditAccountId: string;
}

export interface PermanentRecallInput {
  userId: string;
  credits: number;
}

export interface ResetMonthlyByUserInput {
  userId: string;
}

export interface ResetMonthlyForAllUsersInput {}

export interface ResetMonthlyResult {
  accountsReset: number;
  ledgers: CreditLedger[];
}
