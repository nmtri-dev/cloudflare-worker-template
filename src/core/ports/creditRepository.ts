import { CreditAccount, CreditLedger } from "../domain";

export interface CreditRepository {
  // Account CRUD
  createAccount(account: CreditAccount): Promise<CreditAccount>;
  getAccountById(id: string): Promise<CreditAccount | null>;
  getMonthlyAccountByUserAndPeriod(
    userId: string,
    effectiveFrom: number,
    expiredAt: number,
  ): Promise<CreditAccount | null>;
  getPermanentAccountByUserId(userId: string): Promise<CreditAccount | null>;
  updateAccountCredits(
    id: string,
    newAvailable: number,
    updatedAt: number,
  ): Promise<void>;

  // Ledger
  createLedger(entry: CreditLedger): Promise<CreditLedger>;

  // Transactional: create account + ledger atomically (new grant)
  grantCredits(
    account: CreditAccount,
    ledger: CreditLedger,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;

  // Transactional: top-up existing account + insert ledger (re-grant after recall)
  reGrantCredits(
    accountId: string,
    ledger: CreditLedger,
    additionalCredits: number,
    newAvailable: number,
    updatedAt: number,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;

  // Transactional: deduct credits + insert ledger
  recallCredits(
    accountId: string,
    ledger: CreditLedger,
    newAvailable: number,
    updatedAt: number,
  ): Promise<{ ledger: CreditLedger }>;

  // Get all monthly accounts for a period (for admin reset operations)
  getMonthlyAccountsByPeriod(
    effectiveFrom: number,
    expiredAt: number,
  ): Promise<CreditAccount[]>;
}
