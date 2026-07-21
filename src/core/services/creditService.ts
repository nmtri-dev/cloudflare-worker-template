import {
  CreditAccount,
  CreditLedger,
  MonthlyGrantInput,
  PermanentGrantInput,
  MonthlyRecallInput,
  PermanentRecallInput,
  ResetMonthlyByUserInput,
  ResetMonthlyForAllUsersInput,
  ResetMonthlyResult,
  CreditReferenceType,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  MONTHLY_CREDIT_AMOUNT,
} from "../domain";
import { CreditRepository, Logger } from "../ports";

export class CreditService {
  constructor(
    private readonly creditRepo: CreditRepository,
    private readonly logger: Logger,
  ) {}

  async grantMonthly(
    input: MonthlyGrantInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    // Compute effectiveFrom = 1st of month 00:00:00 UTC
    const effectiveFrom = Math.floor(
      Date.UTC(input.year, input.month - 1, 1) / 1000,
    );
    // Compute expiredAt = last day of month 23:59:59 UTC
    const expiredAt = Math.floor(
      Date.UTC(input.year, input.month, 0, 23, 59, 59) / 1000,
    );

    this.logger.info("Starting monthly grant", {
      userId: input.userId,
      year: input.year,
      month: input.month,
      creditsAmount: MONTHLY_CREDIT_AMOUNT,
      effectiveFrom,
      expiredAt,
    });

    // Look up existing account for this month/year
    const existingAccount =
      await this.creditRepo.getMonthlyAccountByUserAndPeriod(
        input.userId,
        effectiveFrom,
        expiredAt,
      );

    if (existingAccount) {
      // Grant can only happen once per month, regardless of available credits
      this.logger.error("Monthly credit already granted for this period", {
        userId: input.userId,
        existingAccountId: existingAccount.id,
        availableCredits: existingAccount.availableCredits,
      });
      throw new ConflictError("Monthly credit already granted for this period");
    }

    // No existing account — create new
    const accountId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const referenceId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const account: CreditAccount = {
      id: accountId,
      userId: input.userId,
      type: "monthly",
      availableCredits: MONTHLY_CREDIT_AMOUNT,
      effectiveFrom,
      expiredAt,
      updatedAt: now,
    };

    const ledger: CreditLedger = {
      id: ledgerId,
      userId: input.userId,
      type: "grant",
      creditsDelta: MONTHLY_CREDIT_AMOUNT,
      referenceType: "admin",
      referenceId,
      creditAccountId: accountId,
      createdAt: now,
    };

    try {
      const result = await this.creditRepo.grantCredits(account, ledger);
      this.logger.info("Monthly grant successful", {
        userId: input.userId,
        accountId,
        credits: MONTHLY_CREDIT_AMOUNT,
      });
      return result;
    } catch (error) {
      this.logger.error("Failed to grant monthly credits", {
        userId: input.userId,
        error,
      });
      throw error;
    }
  }

  async grantPermanent(
    input: PermanentGrantInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    this.logger.info("Starting permanent grant", {
      userId: input.userId,
      credits: input.credits,
    });

    const accountId = crypto.randomUUID();
    const ledgerId = crypto.randomUUID();
    const referenceId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const account: CreditAccount = {
      id: accountId,
      userId: input.userId,
      type: "permanent",
      availableCredits: input.credits,
      effectiveFrom: null,
      expiredAt: null,
      updatedAt: now,
    };

    const ledger: CreditLedger = {
      id: ledgerId,
      userId: input.userId,
      type: "grant",
      creditsDelta: input.credits,
      referenceType: "admin",
      referenceId,
      creditAccountId: accountId,
      createdAt: now,
    };

    try {
      const result = await this.creditRepo.grantCredits(account, ledger);
      this.logger.info("Permanent grant successful", {
        userId: input.userId,
        accountId,
        credits: input.credits,
      });
      return result;
    } catch (error) {
      this.logger.error("Failed to grant permanent credits", {
        userId: input.userId,
        error,
      });
      throw error;
    }
  }

  async recallMonthly(
    input: MonthlyRecallInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    this.logger.info("Starting monthly recall", {
      userId: input.userId,
      creditAccountId: input.creditAccountId,
    });

    const existingAccount = await this.creditRepo.getAccountById(
      input.creditAccountId,
    );

    if (!existingAccount) {
      this.logger.error("Credit account not found", {
        creditAccountId: input.creditAccountId,
      });
      throw new NotFoundError("Credit account not found");
    }

    if (existingAccount.type !== "monthly") {
      this.logger.error("Account is not a monthly account", {
        creditAccountId: input.creditAccountId,
        accountType: existingAccount.type,
      });
      throw new BadRequestError("Account is not a monthly credit account");
    }

    if (existingAccount.userId !== input.userId) {
      this.logger.error("User ID mismatch for monthly recall", {
        creditAccountId: input.creditAccountId,
        expectedUserId: existingAccount.userId,
        providedUserId: input.userId,
      });
      throw new ForbiddenError("You are not authorized to recall this account");
    }

    const remaining = existingAccount.availableCredits;
    if (remaining <= 0) {
      this.logger.error("No remaining credits to recall", {
        creditAccountId: input.creditAccountId,
        availableCredits: remaining,
      });
      throw new BadRequestError("No remaining credits to recall");
    }

    const ledgerId = crypto.randomUUID();
    const referenceId = crypto.randomUUID();
    const updatedAt = Math.floor(Date.now() / 1000);

    const ledger: CreditLedger = {
      id: ledgerId,
      userId: input.userId,
      type: "recall",
      creditsDelta: -remaining,
      referenceType: "admin",
      referenceId,
      creditAccountId: existingAccount.id,
      createdAt: updatedAt,
    };

    try {
      const result = await this.creditRepo.recallCredits(
        existingAccount.id,
        ledger,
        0, // newAvailable = 0
        updatedAt,
      );

      const account = await this.creditRepo.getAccountById(existingAccount.id);
      if (!account) {
        throw new NotFoundError("Credit account not found after recall");
      }

      this.logger.info("Monthly recall successful", {
        userId: input.userId,
        accountId: existingAccount.id,
        recalled: remaining,
      });

      return { account, ledger: result.ledger };
    } catch (error) {
      this.logger.error("Failed to recall monthly credits", {
        userId: input.userId,
        creditAccountId: input.creditAccountId,
        error,
      });
      throw error;
    }
  }

  async recallPermanent(
    input: PermanentRecallInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    this.logger.info("Starting permanent recall", {
      userId: input.userId,
      credits: input.credits,
    });

    const existingAccount = await this.creditRepo.getPermanentAccountByUserId(
      input.userId,
    );

    if (!existingAccount) {
      this.logger.error("Permanent credit account not found", {
        userId: input.userId,
      });
      throw new NotFoundError("Permanent credit account not found");
    }

    if (existingAccount.type !== "permanent") {
      this.logger.error("Account is not a permanent account", {
        accountId: existingAccount.id,
        accountType: existingAccount.type,
      });
      throw new BadRequestError("Account is not a permanent credit account");
    }

    if (input.credits > existingAccount.availableCredits) {
      this.logger.error("Insufficient credits for recall", {
        userId: input.userId,
        available: existingAccount.availableCredits,
        requested: input.credits,
      });
      throw new BadRequestError(
        `Insufficient credits: available ${existingAccount.availableCredits}, requested ${input.credits}`,
      );
    }

    const ledgerId = crypto.randomUUID();
    const referenceId = crypto.randomUUID();
    const updatedAt = Math.floor(Date.now() / 1000);

    const ledger: CreditLedger = {
      id: ledgerId,
      userId: input.userId,
      type: "recall",
      creditsDelta: -input.credits,
      referenceType: "admin",
      referenceId,
      creditAccountId: existingAccount.id,
      createdAt: updatedAt,
    };

    const newAvailable = existingAccount.availableCredits - input.credits;

    try {
      const result = await this.creditRepo.recallCredits(
        existingAccount.id,
        ledger,
        newAvailable,
        updatedAt,
      );

      const account = await this.creditRepo.getAccountById(existingAccount.id);
      if (!account) {
        throw new NotFoundError("Credit account not found after recall");
      }

      this.logger.info("Permanent recall successful", {
        userId: input.userId,
        accountId: existingAccount.id,
        recalled: input.credits,
        remaining: newAvailable,
      });

      return { account, ledger: result.ledger };
    } catch (error) {
      this.logger.error("Failed to recall permanent credits", {
        userId: input.userId,
        error,
      });
      throw error;
    }
  }

  async resetMonthlyByUser(
    input: ResetMonthlyByUserInput,
  ): Promise<ResetMonthlyResult> {
    // Compute current month period (1st of month → last day of month)
    const now = new Date();
    const effectiveFrom = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
    );
    const expiredAt = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59) /
        1000,
    );

    this.logger.info("Starting monthly reset for user", {
      userId: input.userId,
      effectiveFrom,
      expiredAt,
    });

    const existingAccount =
      await this.creditRepo.getMonthlyAccountByUserAndPeriod(
        input.userId,
        effectiveFrom,
        expiredAt,
      );

    if (!existingAccount) {
      this.logger.info("No monthly account found for user this month", {
        userId: input.userId,
      });
      return { accountsReset: 0, ledgers: [] };
    }

    const refillAmount =
      MONTHLY_CREDIT_AMOUNT - existingAccount.availableCredits;

    if (refillAmount <= 0) {
      this.logger.info("Monthly credits already at maximum, nothing to reset", {
        userId: input.userId,
        availableCredits: existingAccount.availableCredits,
      });
      return { accountsReset: 0, ledgers: [] };
    }

    const updatedAt = Math.floor(Date.now() / 1000);
    const ledgerId = crypto.randomUUID();
    const referenceId = crypto.randomUUID();

    const ledger: CreditLedger = {
      id: ledgerId,
      userId: input.userId,
      type: "grant",
      creditsDelta: refillAmount,
      referenceType: "admin",
      referenceId,
      creditAccountId: existingAccount.id,
      createdAt: updatedAt,
    };

    try {
      const result = await this.creditRepo.reGrantCredits(
        existingAccount.id,
        ledger,
        refillAmount,
        MONTHLY_CREDIT_AMOUNT, // Reset back to full
        updatedAt,
      );

      this.logger.info("Monthly reset successful for user", {
        userId: input.userId,
        accountId: existingAccount.id,
        refilledAmount: refillAmount,
        newAvailable: MONTHLY_CREDIT_AMOUNT,
      });

      return { accountsReset: 1, ledgers: [result.ledger] };
    } catch (error) {
      this.logger.error("Failed to reset monthly credits for user", {
        userId: input.userId,
        error,
      });
      throw error;
    }
  }

  async resetMonthlyForAllUsers(
    _input: ResetMonthlyForAllUsersInput,
  ): Promise<ResetMonthlyResult> {
    // Compute current month period (1st of month → last day of month)
    const now = new Date();
    const effectiveFrom = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000,
    );
    const expiredAt = Math.floor(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59) /
        1000,
    );

    this.logger.info("Starting monthly reset for all users", {
      effectiveFrom,
      expiredAt,
    });

    const accounts = await this.creditRepo.getMonthlyAccountsByPeriod(
      effectiveFrom,
      expiredAt,
    );

    if (accounts.length === 0) {
      this.logger.info("No monthly accounts found for this month");
      return { accountsReset: 0, ledgers: [] };
    }

    const updatedAt = Math.floor(Date.now() / 1000);
    const ledgers: CreditLedger[] = [];
    let accountsReset = 0;

    // Refill each account back to MONTHLY_CREDIT_AMOUNT
    for (const account of accounts) {
      const refillAmount = MONTHLY_CREDIT_AMOUNT - account.availableCredits;

      if (refillAmount <= 0) continue; // Already at max, skip

      const ledgerId = crypto.randomUUID();
      const referenceId = crypto.randomUUID();

      const ledger: CreditLedger = {
        id: ledgerId,
        userId: account.userId,
        type: "grant",
        creditsDelta: refillAmount,
        referenceType: "admin",
        referenceId,
        creditAccountId: account.id,
        createdAt: updatedAt,
      };

      try {
        await this.creditRepo.reGrantCredits(
          account.id,
          ledger,
          refillAmount,
          MONTHLY_CREDIT_AMOUNT, // Reset back to full
          updatedAt,
        );
        ledgers.push(ledger);
        accountsReset++;
      } catch (error) {
        this.logger.error("Failed to reset monthly credits for an account", {
          accountId: account.id,
          userId: account.userId,
          error,
        });
        // Continue with remaining accounts, do not fail the entire batch
      }
    }

    this.logger.info("Monthly reset for all users completed", {
      accountsReset,
      totalAccountsScanned: accounts.length,
      ledgerCount: ledgers.length,
    });

    return { accountsReset, ledgers };
  }
}
