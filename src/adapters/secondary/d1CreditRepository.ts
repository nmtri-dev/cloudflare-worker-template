import { CreditAccount, CreditLedger, InternalError } from "../../core/domain";
import { CreditRepository, Logger } from "../../core/ports";

export class D1CreditRepository implements CreditRepository {
  constructor(
    private readonly db: D1Database,
    private logger: Logger,
  ) {}

  async createAccount(account: CreditAccount): Promise<CreditAccount> {
    const stmt = this.db
      .prepare(
        `INSERT INTO credit_accounts (id, user_id, type, available_credits, effective_from, expired_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        account.id,
        account.userId,
        account.type,
        account.availableCredits,
        account.effectiveFrom,
        account.expiredAt,
        account.updatedAt,
      );
    await stmt.run();
    return account;
  }

  async getAccountById(id: string): Promise<CreditAccount | null> {
    const stmt = this.db
      .prepare("SELECT * FROM credit_accounts WHERE id = ?")
      .bind(id);
    const result = await stmt.first<RowAccount>();
    if (!result) return null;
    return mapRowToAccount(result);
  }

  async getMonthlyAccountByUserAndPeriod(
    userId: string,
    effectiveFrom: number,
    expiredAt: number,
  ): Promise<CreditAccount | null> {
    const stmt = this.db
      .prepare(
        `SELECT * FROM credit_accounts
       WHERE user_id = ? AND type = 'monthly' AND effective_from = ? AND expired_at = ?`,
      )
      .bind(userId, effectiveFrom, expiredAt);
    const result = await stmt.first<RowAccount>();
    if (!result) return null;
    return mapRowToAccount(result);
  }

  async getPermanentAccountByUserId(
    userId: string,
  ): Promise<CreditAccount | null> {
    const stmt = this.db
      .prepare(
        `SELECT * FROM credit_accounts
       WHERE user_id = ? AND type = 'permanent'`,
      )
      .bind(userId);
    const result = await stmt.first<RowAccount>();
    if (!result) return null;
    return mapRowToAccount(result);
  }

  async updateAccountCredits(
    id: string,
    newAvailable: number,
    updatedAt: number,
  ): Promise<void> {
    const stmt = this.db
      .prepare(
        "UPDATE credit_accounts SET available_credits = ?, updated_at = ? WHERE id = ?",
      )
      .bind(newAvailable, updatedAt, id);
    await stmt.run();
  }

  async createLedger(entry: CreditLedger): Promise<CreditLedger> {
    const stmt = this.db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, type, credits_delta, reference_type, reference_id, credit_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        entry.id,
        entry.userId,
        entry.type,
        entry.creditsDelta,
        entry.referenceType,
        entry.referenceId,
        entry.creditAccountId,
        entry.createdAt,
      );
    await stmt.run();
    return entry;
  }

  async grantCredits(
    account: CreditAccount,
    ledger: CreditLedger,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    const insertAccount = this.db
      .prepare(
        `INSERT INTO credit_accounts (id, user_id, type, available_credits, effective_from, expired_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        account.id,
        account.userId,
        account.type,
        account.availableCredits,
        account.effectiveFrom,
        account.expiredAt,
        account.updatedAt,
      );

    const insertLedger = this.db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, type, credits_delta, reference_type, reference_id, credit_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ledger.id,
        ledger.userId,
        ledger.type,
        ledger.creditsDelta,
        ledger.referenceType,
        ledger.referenceId,
        ledger.creditAccountId,
        ledger.createdAt,
      );

    await this.db.batch([insertAccount, insertLedger]);

    return { account, ledger };
  }

  async reGrantCredits(
    accountId: string,
    ledger: CreditLedger,
    additionalCredits: number,
    newAvailable: number,
    updatedAt: number,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    const updateAccount = this.db
      .prepare(
        `UPDATE credit_accounts
       SET available_credits = ?, updated_at = ?
       WHERE id = ?`,
      )
      .bind(newAvailable, updatedAt, accountId);

    const insertLedger = this.db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, type, credits_delta, reference_type, reference_id, credit_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ledger.id,
        ledger.userId,
        ledger.type,
        ledger.creditsDelta,
        ledger.referenceType,
        ledger.referenceId,
        ledger.creditAccountId,
        ledger.createdAt,
      );

    await this.db.batch([updateAccount, insertLedger]);

    const account = await this.getAccountById(accountId);
    if (!account) {
      this.logger.error("Account not found after re-grant", { accountId });
      throw new InternalError("Account not found after re-grant");
    }

    return { account, ledger };
  }

  async recallCredits(
    accountId: string,
    ledger: CreditLedger,
    newAvailable: number,
    updatedAt: number,
  ): Promise<{ ledger: CreditLedger }> {
    const updateAccount = this.db
      .prepare(
        `UPDATE credit_accounts
       SET available_credits = ?, updated_at = ?
       WHERE id = ?`,
      )
      .bind(newAvailable, updatedAt, accountId);

    const insertLedger = this.db
      .prepare(
        `INSERT INTO credit_ledger (id, user_id, type, credits_delta, reference_type, reference_id, credit_account_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ledger.id,
        ledger.userId,
        ledger.type,
        ledger.creditsDelta,
        ledger.referenceType,
        ledger.referenceId,
        ledger.creditAccountId,
        ledger.createdAt,
      );

    await this.db.batch([updateAccount, insertLedger]);

    return { ledger };
  }

  async getMonthlyAccountsByPeriod(
    effectiveFrom: number,
    expiredAt: number,
  ): Promise<CreditAccount[]> {
    const stmt = this.db
      .prepare(
        `SELECT * FROM credit_accounts
       WHERE type = 'monthly' AND effective_from = ? AND expired_at = ?
       ORDER BY user_id`,
      )
      .bind(effectiveFrom, expiredAt);
    const results = await stmt.all<RowAccount>();
    if (!results.results) return [];
    return results.results.map(mapRowToAccount);
  }
}

// ── Row mapping ──

interface RowAccount {
  id: string;
  user_id: string;
  type: string;
  available_credits: number;
  effective_from: number | null;
  expired_at: number | null;
  updated_at: number;
}

function mapRowToAccount(row: RowAccount): CreditAccount {
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type as CreditAccount["type"],
    availableCredits: row.available_credits,
    effectiveFrom: row.effective_from,
    expiredAt: row.expired_at,
    updatedAt: row.updated_at,
  };
}
