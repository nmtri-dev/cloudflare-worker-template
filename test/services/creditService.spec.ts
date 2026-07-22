import { describe, it, expect, vi } from "vitest";
import { CreditService } from "../../src/core/services/creditService";
import { CreditRepository, Logger } from "../../src/core/ports";
import {
  CreditAccount,
  CreditLedger,
  MonthlyGrantInput,
  PermanentGrantInput,
  MonthlyRecallInput,
  PermanentRecallInput,
  PartialPermanentRecallInput,
  BadRequestError,
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UserCreditsResult,
} from "../../src/core/domain";

// ── Helpers ──

function makeLogger(): Logger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  };
}

function makeAccount(overrides: Partial<CreditAccount> = {}): CreditAccount {
  return {
    id: "account-uuid-1",
    userId: "user-uuid-1",
    type: "monthly",
    availableCredits: 100,
    effectiveFrom: Math.floor(Date.UTC(2026, 6, 1) / 1000), // July 2026
    expiredAt: Math.floor(Date.UTC(2026, 6, 31, 23, 59, 59) / 1000),
    updatedAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

function makeLedger(overrides: Partial<CreditLedger> = {}): CreditLedger {
  return {
    id: "ledger-uuid-1",
    userId: "user-uuid-1",
    type: "grant",
    creditsDelta: 100,
    referenceType: "admin",
    referenceId: "ref-uuid-1",
    creditAccountId: "account-uuid-1",
    createdAt: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

describe("CreditService", () => {
  // ── grantMonthly ──

  describe("grantMonthly", () => {
    it("should create monthly account with 300 credits (1st → last day of month)", async () => {
      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi.fn().mockResolvedValue(null),
        grantCredits: vi
          .fn()
          .mockImplementation((account, ledger) =>
            Promise.resolve({ account, ledger }),
          ),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const input: MonthlyGrantInput = {
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
        year: 2026,
        month: 7, // July
      };

      const result = await service.grantMonthly(input);

      const accountArg = (mockRepo.grantCredits as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as CreditAccount;
      // July 2026: 1st is 2026-07-01 00:00:00 UTC
      expect(accountArg.effectiveFrom).toBe(
        Math.floor(Date.UTC(2026, 6, 1) / 1000),
      );
      // Last day: 2026-07-31 23:59:59 UTC
      expect(accountArg.expiredAt).toBe(
        Math.floor(Date.UTC(2026, 6, 31, 23, 59, 59) / 1000),
      );
      expect(accountArg.type).toBe("monthly");
      expect(accountArg.availableCredits).toBe(300);
      expect(result.account).toBeDefined();
      expect(result.ledger).toBeDefined();
    });

    it("should throw ConflictError if account already exists for month (regardless of available credits)", async () => {
      const existingAccount = makeAccount({ availableCredits: 0 });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const input: MonthlyGrantInput = {
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
        year: 2026,
        month: 7,
      };

      await expect(service.grantMonthly(input)).rejects.toThrow(ConflictError);
      await expect(service.grantMonthly(input)).rejects.toThrow(
        "Monthly credit already granted for this period",
      );
    });

    it("should throw ConflictError on duplicate grant attempt", async () => {
      const existingAccount = makeAccount({ availableCredits: 100 });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const input: MonthlyGrantInput = {
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
        year: 2026,
        month: 7,
      };

      await expect(service.grantMonthly(input)).rejects.toThrow(ConflictError);
      await expect(service.grantMonthly(input)).rejects.toThrow(
        "Monthly credit already granted for this period",
      );
    });
  });

  // ── grantPermanent ──

  describe("grantPermanent", () => {
    it("should create account with null effectiveFrom and expiredAt (first grant)", async () => {
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
        grantCredits: vi
          .fn()
          .mockImplementation((account, ledger) =>
            Promise.resolve({ account, ledger }),
          ),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const input: PermanentGrantInput = {
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
        credits: 200,
      };

      const result = await service.grantPermanent(input);

      const accountArg = (mockRepo.grantCredits as ReturnType<typeof vi.fn>)
        .mock.calls[0][0] as CreditAccount;
      expect(accountArg.effectiveFrom).toBeNull();
      expect(accountArg.expiredAt).toBeNull();
      expect(accountArg.type).toBe("permanent");
      expect(accountArg.availableCredits).toBe(200);
      expect(result.account).toBeDefined();
      expect(result.ledger).toBeDefined();
    });

    it("should top up existing permanent account on subsequent grant", async () => {
      const existingAccount = makeAccount({
        type: "permanent",
        availableCredits: 100,
      });
      const toppedUpAccount = makeAccount({
        type: "permanent",
        availableCredits: 300,
      });

      const mockRepo = {
        getPermanentAccountByUserId: vi
          .fn()
          .mockResolvedValue(existingAccount),
        reGrantCredits: vi.fn().mockResolvedValue({
          account: toppedUpAccount,
          ledger: makeLedger({
            type: "grant",
            creditsDelta: 200,
            creditAccountId: existingAccount.id,
          }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.grantPermanent({
        userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
        credits: 200,
      });

      expect(mockRepo.getPermanentAccountByUserId).toHaveBeenCalledWith(
        "user-uuid-1",
      );
      expect(mockRepo.reGrantCredits).toHaveBeenCalledOnce();
      expect(result.account.availableCredits).toBe(300);
      expect(result.ledger.type).toBe("grant");
      expect(result.ledger.creditsDelta).toBe(200);
    });

    it("should successfully grant for any credits amount", async () => {
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
        grantCredits: vi
          .fn()
          .mockImplementation((account, ledger) =>
            Promise.resolve({ account, ledger }),
          ),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.grantPermanent({
        userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
        credits: 9999,
      });

      expect(result.account.availableCredits).toBe(9999);
    });
  });

  // ── recallMonthly ──

  describe("recallMonthly", () => {
    it("should deduct all remaining credits (availableCredits → 0)", async () => {
      const existingAccount = makeAccount({ availableCredits: 75 });
      const recalledAccount = makeAccount({ availableCredits: 0 });

      const mockRepo = {
        getAccountById: vi.fn().mockResolvedValue(existingAccount),
        recallCredits: vi.fn().mockResolvedValue({
          ledger: makeLedger({ type: "recall", creditsDelta: -75 }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      // Mock getAccountById to return recalledAccount on second call
      vi.mocked(mockRepo.getAccountById)
        .mockResolvedValueOnce(existingAccount)
        .mockResolvedValueOnce(recalledAccount);

      const input: MonthlyRecallInput = {
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
        creditAccountId: "account-uuid-1",
      };

      const result = await service.recallMonthly(input);
      expect(result.account.availableCredits).toBe(0);
      expect(result.ledger.type).toBe("recall");
      expect(result.ledger.creditsDelta).toBe(-75);
    });

    it("should throw NotFoundError for missing account", async () => {
      const mockRepo = {
        getAccountById: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallMonthly({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          creditAccountId: "missing-uuid",
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw ForbiddenError if userId mismatch", async () => {
      const existingAccount = makeAccount({ userId: "different-user" });
      const mockRepo = {
        getAccountById: vi.fn().mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallMonthly({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          creditAccountId: "account-uuid-1",
        }),
      ).rejects.toThrow(ForbiddenError);
    });

    it("should throw BadRequestError if account type is permanent", async () => {
      const existingAccount = makeAccount({ type: "permanent" });
      const mockRepo = {
        getAccountById: vi.fn().mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallMonthly({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          creditAccountId: "account-uuid-1",
        }),
      ).rejects.toThrow(BadRequestError);
    });

    it("should throw BadRequestError if no remaining credits", async () => {
      const existingAccount = makeAccount({ availableCredits: 0 });
      const mockRepo = {
        getAccountById: vi.fn().mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallMonthly({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          creditAccountId: "account-uuid-1",
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ── recallPermanent ──

  describe("recallPermanent", () => {
    it("should deduct all remaining credits (availableCredits → 0)", async () => {
      const existingAccount = makeAccount({
        type: "permanent",
        availableCredits: 200,
      });
      const updatedAccount = makeAccount({
        type: "permanent",
        availableCredits: 0,
      });

      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(existingAccount),
        getAccountById: vi.fn().mockResolvedValue(updatedAccount),
        recallCredits: vi.fn().mockResolvedValue({
          ledger: makeLedger({
            type: "recall",
            creditsDelta: -200,
            creditAccountId: existingAccount.id,
          }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.recallPermanent({
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
      });

      expect(mockRepo.getPermanentAccountByUserId).toHaveBeenCalledWith(
        "user-uuid-1",
      );
      expect(result.account.availableCredits).toBe(0);
      expect(result.ledger.type).toBe("recall");
      expect(result.ledger.creditsDelta).toBe(-200);
    });

    it("should throw NotFoundError if no permanent account exists", async () => {
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallPermanent({ userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1" }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if no remaining credits", async () => {
      const existingAccount = makeAccount({
        type: "permanent",
        availableCredits: 0,
      });
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallPermanent({ userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1" }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  // ── recallPermanentPartial ──

  describe("recallPermanentPartial", () => {
    it("should partially deduct credits by userId", async () => {
      const existingAccount = makeAccount({
        type: "permanent",
        availableCredits: 200,
      });
      const updatedAccount = makeAccount({
        type: "permanent",
        availableCredits: 150,
      });

      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(existingAccount),
        getAccountById: vi.fn().mockResolvedValue(updatedAccount),
        recallCredits: vi.fn().mockResolvedValue({
          ledger: makeLedger({
            type: "recall",
            creditsDelta: -50,
            creditAccountId: existingAccount.id,
          }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.recallPermanentPartial({
        userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
        credits: 50,
      });

      expect(mockRepo.getPermanentAccountByUserId).toHaveBeenCalledWith(
        "user-uuid-1",
      );
      expect(result.account.availableCredits).toBe(150);
      expect(result.ledger.type).toBe("recall");
      expect(result.ledger.creditsDelta).toBe(-50);
    });

    it("should throw NotFoundError if no permanent account exists", async () => {
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallPermanentPartial({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          credits: 50,
        }),
      ).rejects.toThrow(NotFoundError);
    });

    it("should throw BadRequestError if insufficient credits", async () => {
      const existingAccount = makeAccount({ type: "permanent", availableCredits: 10 });
      const mockRepo = {
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      await expect(
        service.recallPermanentPartial({
          userId: "user-uuid-1",
          referenceType: "admin",
          referenceId: "ref-uuid-1",
          credits: 50,
        }),
      ).rejects.toThrow(BadRequestError);
    });
  });

  describe("resetMonthlyByUser", () => {
    it("should refill monthly credits back to 300 for a user", async () => {
      const existingAccount = makeAccount({
        type: "monthly",
        availableCredits: 150,
      });
      const refilledAccount = makeAccount({
        type: "monthly",
        availableCredits: 300,
      });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(existingAccount),
        reGrantCredits: vi.fn().mockResolvedValue({
          account: refilledAccount,
          ledger: makeLedger({
            type: "grant",
            creditsDelta: 150,
            creditAccountId: existingAccount.id,
          }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyByUser({
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
      });

      expect(result.accountsReset).toBe(1);
      expect(result.ledgers).toHaveLength(1);
      expect(result.ledgers[0].type).toBe("grant");
      expect(result.ledgers[0].creditsDelta).toBe(150);
      expect(mockRepo.reGrantCredits).toHaveBeenCalledOnce();
    });

    it("should return accountsReset=0 if already at full credits", async () => {
      const existingAccount = makeAccount({
        type: "monthly",
        availableCredits: 300,
      });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(existingAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyByUser({
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
      });

      expect(result.accountsReset).toBe(0);
      expect(result.ledgers).toHaveLength(0);
    });

    it("should return accountsReset=0 if no account found for current month", async () => {
      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyByUser({
        userId: "user-uuid-1",
        referenceType: "admin",
        referenceId: "ref-uuid-1",
      });

      expect(result.accountsReset).toBe(0);
      expect(result.ledgers).toHaveLength(0);
    });
  });

  describe("resetMonthlyForAllUsers", () => {
    it("should refill monthly credits for multiple users back to 300", async () => {
      const account1 = makeAccount({
        type: "monthly",
        userId: "user-1",
        availableCredits: 100,
      });
      const account2 = makeAccount({
        type: "monthly",
        userId: "user-2",
        availableCredits: 200,
      });

      const mockRepo = {
        getMonthlyAccountsByPeriod: vi
          .fn()
          .mockResolvedValue([account1, account2]),
        reGrantCredits: vi.fn().mockResolvedValue({
          account: makeAccount({ availableCredits: 300 }),
          ledger: makeLedger({ type: "grant", creditsDelta: 100 }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyForAllUsers({ referenceType: "admin", referenceId: "ref-uuid-1" });

      expect(result.accountsReset).toBe(2);
      expect(result.ledgers).toHaveLength(2);
      expect(mockRepo.reGrantCredits).toHaveBeenCalledTimes(2);
    });

    it("should skip accounts already at full credits", async () => {
      const account1 = makeAccount({
        type: "monthly",
        userId: "user-1",
        availableCredits: 150,
      });
      const account2 = makeAccount({
        type: "monthly",
        userId: "user-2",
        availableCredits: 300, // Already full
      });

      const mockRepo = {
        getMonthlyAccountsByPeriod: vi
          .fn()
          .mockResolvedValue([account1, account2]),
        reGrantCredits: vi.fn().mockResolvedValue({
          account: makeAccount({ availableCredits: 300 }),
          ledger: makeLedger({ type: "grant", creditsDelta: 150 }),
        }),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyForAllUsers({ referenceType: "admin", referenceId: "ref-uuid-1" });

      expect(result.accountsReset).toBe(1); // Only account1 was refilled
      expect(result.ledgers).toHaveLength(1);
      expect(mockRepo.reGrantCredits).toHaveBeenCalledTimes(1);
    });

    it("should return accountsReset=0 if no accounts found for current month", async () => {
      const mockRepo = {
        getMonthlyAccountsByPeriod: vi.fn().mockResolvedValue([]),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.resetMonthlyForAllUsers({ referenceType: "admin", referenceId: "ref-uuid-1" });

      expect(result.accountsReset).toBe(0);
      expect(result.ledgers).toHaveLength(0);
    });
  });

  // ── getUserCredits ──

  describe("getUserCredits", () => {
    it("should return monthly and permanent credits for a user with both accounts", async () => {
      const monthlyAccount = makeAccount({
        type: "monthly",
        userId: "user-uuid-1",
        availableCredits: 250,
      });
      const permanentAccount = makeAccount({
        type: "permanent",
        userId: "user-uuid-1",
        availableCredits: 500,
        effectiveFrom: null,
        expiredAt: null,
      });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(monthlyAccount),
        getPermanentAccountByUserId: vi
          .fn()
          .mockResolvedValue(permanentAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.getUserCredits("user-uuid-1");

      expect(result).toEqual<UserCreditsResult>({
        userId: "user-uuid-1",
        monthlyCredits: 250,
        permanentCredits: 500,
      });
    });

    it("should return 0 for both when user has no accounts", async () => {
      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi.fn().mockResolvedValue(null),
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.getUserCredits("user-uuid-1");

      expect(result).toEqual<UserCreditsResult>({
        userId: "user-uuid-1",
        monthlyCredits: 0,
        permanentCredits: 0,
      });
    });

    it("should return monthly credits but 0 permanent when only monthly account exists", async () => {
      const monthlyAccount = makeAccount({
        type: "monthly",
        userId: "user-uuid-1",
        availableCredits: 300,
      });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi
          .fn()
          .mockResolvedValue(monthlyAccount),
        getPermanentAccountByUserId: vi.fn().mockResolvedValue(null),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.getUserCredits("user-uuid-1");

      expect(result).toEqual<UserCreditsResult>({
        userId: "user-uuid-1",
        monthlyCredits: 300,
        permanentCredits: 0,
      });
    });

    it("should return permanent credits but 0 monthly when only permanent account exists", async () => {
      const permanentAccount = makeAccount({
        type: "permanent",
        userId: "user-uuid-1",
        availableCredits: 100,
        effectiveFrom: null,
        expiredAt: null,
      });

      const mockRepo = {
        getMonthlyAccountByUserAndPeriod: vi.fn().mockResolvedValue(null),
        getPermanentAccountByUserId: vi
          .fn()
          .mockResolvedValue(permanentAccount),
      } as unknown as CreditRepository;
      const logger = makeLogger();
      const service = new CreditService(mockRepo, logger);

      const result = await service.getUserCredits("user-uuid-1");

      expect(result).toEqual<UserCreditsResult>({
        userId: "user-uuid-1",
        monthlyCredits: 0,
        permanentCredits: 100,
      });
    });
  });
});
