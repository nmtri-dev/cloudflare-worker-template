import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeAll } from "vitest";
import { getAuthorizationHeader } from "./helpers/auth";

// ── Helpers ──

async function post(
  path: string,
  body: Record<string, unknown>,
  authHeader?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const res = await SELF.fetch(`http://localhost${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  const json = await res.json<Record<string, unknown>>();
  return { status: res.status, data: json };
}

async function get(
  path: string,
  authHeader?: string,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {};
  if (authHeader) {
    headers["Authorization"] = authHeader;
  }

  const res = await SELF.fetch(`http://localhost${path}`, {
    method: "GET",
    headers,
  });

  const json = await res.json<Record<string, unknown>>();
  return { status: res.status, data: json };
}

let authHeader: string;

beforeAll(async () => {
  // Run migration to create tables in the test D1 database
  // D1 exec() only accepts a single statement; keep each SQL on one line
  await env.CREDIT_DB.exec("CREATE TABLE IF NOT EXISTS credit_accounts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, available_credits INTEGER NOT NULL DEFAULT 0, effective_from INTEGER, expired_at INTEGER, updated_at INTEGER NOT NULL)");
  await env.CREDIT_DB.exec("CREATE INDEX IF NOT EXISTS idx_credit_accounts_user_id ON credit_accounts(user_id)");
  await env.CREDIT_DB.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_account_unique ON credit_accounts(user_id, effective_from, expired_at) WHERE type = 'monthly'");

  await env.CREDIT_DB.exec("CREATE TABLE IF NOT EXISTS credit_ledger (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, type TEXT NOT NULL, credits_delta INTEGER NOT NULL, reference_type TEXT NOT NULL, reference_id TEXT NOT NULL, credit_account_id TEXT NOT NULL REFERENCES credit_accounts(id), created_at INTEGER NOT NULL)");
  await env.CREDIT_DB.exec("CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id)");
  await env.CREDIT_DB.exec("CREATE INDEX IF NOT EXISTS idx_credit_ledger_account_id ON credit_ledger(credit_account_id)");

  authHeader = await getAuthorizationHeader("user", ["admin"]);
});

describe("POST /credits/grant/monthly", () => {
  it("should return 201 with 300 credits on success", async () => {
    const { status, data } = await post(
      "/credits/grant/monthly",
      {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        year: 2026,
        month: 7,
      },
      authHeader,
    );

    expect(status).toBe(201);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    expect(inner.account).toBeDefined();
    expect(inner.ledger).toBeDefined();
    const account = inner.account as Record<string, unknown>;
    expect(account.availableCredits).toBe(300);
  });

  it("should return 401 when auth is missing", async () => {
    const { status } = await post("/credits/grant/monthly", {
      userId: "550e8400-e29b-41d4-a716-446655440001",
      year: 2026,
      month: 7,
    });

    expect(status).toBe(401);
  });

  it("should return 400 for invalid body", async () => {
    const { status } = await post(
      "/credits/grant/monthly",
      {
        userId: "not-a-uuid",
        year: 1999,
        month: 13,
      },
      authHeader,
    );

    expect(status).toBe(400);
  });

  it("should reject re-grant attempt even after full recall", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440002";

    // Grant
    const grantResult = await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 8 },
      authHeader,
    );
    expect(grantResult.status).toBe(201);

    const grantData = (grantResult.data as Record<string, unknown>).data as Record<string, unknown>;
    const creditAccountId = (grantData.account as Record<string, unknown>).id as string;

    // Recall all
    const recallResult = await post(
      "/credits/recall/monthly",
      { userId, creditAccountId },
      authHeader,
    );
    expect(recallResult.status).toBe(200);

    // Try to re-grant - should fail even though credits = 0
    const reGrantResult = await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 8 },
      authHeader,
    );
    expect(reGrantResult.status).toBe(409);
    expect((reGrantResult.data as Record<string, unknown>).error).toBe("ConflictError");
  });

  it("should return 409 on duplicate grant in same month", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440003";

    // First grant
    const firstGrant = await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 9 },
      authHeader,
    );
    expect(firstGrant.status).toBe(201);

    // Duplicate attempt - should fail
    const { status, data } = await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 9 },
      authHeader,
    );

    expect(status).toBe(409);
    expect((data as Record<string, unknown>).error).toBe("ConflictError");
  });
});

describe("POST /credits/grant/permanent", () => {
  it("should return 201 with account and ledger on first grant", async () => {
    const userId = "550e8400-e29b-41d4-a716-44665544a001";
    const { status, data } = await post(
      "/credits/grant/permanent",
      {
        userId,
        credits: 100,
      },
      authHeader,
    );

    expect(status).toBe(201);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    expect(inner.account).toBeDefined();
    expect(inner.ledger).toBeDefined();
    const account = inner.account as Record<string, unknown>;
    expect(account.type).toBe("permanent");
    expect(account.availableCredits).toBe(100);
  });

  it("should top up existing permanent account on subsequent grant", async () => {
    const userId = "550e8400-e29b-41d4-a716-44665544a002";

    // First grant
    const firstGrant = await post(
      "/credits/grant/permanent",
      { userId, credits: 100 },
      authHeader,
    );
    expect(firstGrant.status).toBe(201);

    // Second grant — should top up
    const { status, data } = await post(
      "/credits/grant/permanent",
      { userId, credits: 50 },
      authHeader,
    );

    expect(status).toBe(201);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    const account = inner.account as Record<string, unknown>;
    expect(account.availableCredits).toBe(150);
    expect(account.type).toBe("permanent");
    const ledger = inner.ledger as Record<string, unknown>;
    expect(ledger.creditsDelta).toBe(50);
    expect(ledger.type).toBe("grant");
  });
});

describe("POST /credits/recall/monthly", () => {
  it("should return 200 and set availableCredits to 0", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440004";

    // Grant first
    const grantResult = await post(
      "/credits/grant/monthly",
      { userId, credits: 40, year: 2026, month: 10 },
      authHeader,
    );
    const grantData = (grantResult.data as Record<string, unknown>).data as Record<string, unknown>;
    const creditAccountId = (grantData.account as Record<string, unknown>).id as string;

    // Recall
    const { status, data } = await post(
      "/credits/recall/monthly",
      { userId, creditAccountId },
      authHeader,
    );

    expect(status).toBe(200);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    const account = inner.account as Record<string, unknown>;
    expect(account.availableCredits).toBe(0);
  });

  it("should return 404 for non-existent account", async () => {
    const { status, data } = await post(
      "/credits/recall/monthly",
      {
        userId: "550e8400-e29b-41d4-a716-446655440000",
        creditAccountId: "550e8400-e29b-41d4-a716-446655449999",
      },
      authHeader,
    );

    expect(status).toBe(404);
    expect((data as Record<string, unknown>).error).toBe("NotFoundError");
  });
});

describe("POST /credits/recall/permanent", () => {
  it("should return 200 and fully recall all remaining credits", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440005";

    // Grant permanent
    await post(
      "/credits/grant/permanent",
      { userId, credits: 200 },
      authHeader,
    );

    // Full recall
    const { status, data } = await post(
      "/credits/recall/permanent",
      { userId },
      authHeader,
    );

    expect(status).toBe(200);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    const account = inner.account as Record<string, unknown>;
    expect(account.availableCredits).toBe(0);
  });

  it("should return 404 when no permanent account exists", async () => {
    const { status, data } = await post(
      "/credits/recall/permanent",
      { userId: "550e8400-e29b-41d4-a716-446655449998" },
      authHeader,
    );

    expect(status).toBe(404);
    expect((data as Record<string, unknown>).error).toBe("NotFoundError");
  });
});

describe("POST /credits/recall/permanent/partial", () => {
  it("should return 200 for partial recall", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440007";

    // Grant permanent
    await post(
      "/credits/grant/permanent",
      { userId, credits: 200 },
      authHeader,
    );

    // Partial recall
    const { status, data } = await post(
      "/credits/recall/permanent/partial",
      { userId, credits: 50 },
      authHeader,
    );

    expect(status).toBe(200);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    const account = inner.account as Record<string, unknown>;
    expect(account.availableCredits).toBe(150);
    const ledger = inner.ledger as Record<string, unknown>;
    expect(ledger.creditsDelta).toBe(-50);
  });

  it("should return 400 for insufficient credits", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440008";

    // Grant permanent
    await post(
      "/credits/grant/permanent",
      { userId, credits: 30 },
      authHeader,
    );

    // Try to recall more than available
    const { status, data } = await post(
      "/credits/recall/permanent/partial",
      { userId, credits: 100 },
      authHeader,
    );

    expect(status).toBe(400);
    expect((data as Record<string, unknown>).error).toBe("BadRequestError");
  });
});

describe("POST /credits/reset/monthly", () => {
  it("should return 202 and queued status for a specific user", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440010";

    // Grant monthly credits
    const grantResult = await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 7 },
      authHeader,
    );
    expect(grantResult.status).toBe(201);

    // Reset — should return 202 Accepted
    const { status, data } = await post(
      "/credits/reset/monthly",
      { userId },
      authHeader,
    );

    expect(status).toBe(202);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    expect(inner.userId).toBe(userId);
    expect(inner.status).toBe("queued");
  });

  it("should return 202 even when no account exists (queue will handle it)", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440011";

    const { status, data } = await post(
      "/credits/reset/monthly",
      { userId },
      authHeader,
    );

    expect(status).toBe(202);
    const d = data as Record<string, unknown>;
    const inner = d.data as Record<string, unknown>;
    expect(inner.status).toBe("queued");
  });

  it("should return 401 when auth is missing", async () => {
    const { status } = await post(
      "/credits/reset/monthly",
      { userId: "550e8400-e29b-41d4-a716-446655440012" },
    );

    expect(status).toBe(401);
  });
});

describe("POST /credits/reset/monthly-all", () => {
  it("should return 202 and enqueue resets for all users", async () => {
    const userId1 = "550e8400-e29b-41d4-a716-446655440020";
    const userId2 = "550e8400-e29b-41d4-a716-446655440021";

    // Grant for two users
    await post(
      "/credits/grant/monthly",
      { userId: userId1, year: 2026, month: 7 },
      authHeader,
    );
    await post(
      "/credits/grant/monthly",
      { userId: userId2, year: 2026, month: 7 },
      authHeader,
    );

    // Reset all
    const { status, data } = await post(
      "/credits/reset/monthly-all",
      {},
      authHeader,
    );

    expect(status).toBe(202);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    // At least the 2 accounts we just created (other tests may have created more)
    expect((inner.enqueuedCount as number) >= 2).toBe(true);
    expect(inner.status).toBe("queued");
  });

  it("should return 401 when auth is missing", async () => {
    const { status } = await post(
      "/credits/reset/monthly-all",
      {},
    );

    expect(status).toBe(401);
  });
});

describe("GET /credits/user/:userId", () => {
  it("should return 200 with monthly and permanent credits for a user with both", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440100";

    // Grant monthly credits
    await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 7 },
      authHeader,
    );

    // Grant permanent credits
    await post(
      "/credits/grant/permanent",
      { userId, credits: 500 },
      authHeader,
    );

    const { status, data } = await get(
      `/credits/user/${userId}`,
      authHeader,
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    expect(inner.userId).toBe(userId);
    expect(inner.monthlyCredits).toBe(300);
    expect(inner.permanentCredits).toBe(500);
  });

  it("should return 200 with 0 for both when user has no accounts", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440101";

    const { status, data } = await get(
      `/credits/user/${userId}`,
      authHeader,
    );

    expect(status).toBe(200);
    const d = data as Record<string, unknown>;
    expect(d.data).toBeDefined();
    const inner = d.data as Record<string, unknown>;
    expect(inner.userId).toBe(userId);
    expect(inner.monthlyCredits).toBe(0);
    expect(inner.permanentCredits).toBe(0);
  });

  it("should return 200 with only monthly credits when only monthly account exists", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440102";

    // Grant monthly credits
    await post(
      "/credits/grant/monthly",
      { userId, year: 2026, month: 7 },
      authHeader,
    );

    const { status, data } = await get(
      `/credits/user/${userId}`,
      authHeader,
    );

    expect(status).toBe(200);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    expect(inner.userId).toBe(userId);
    expect(inner.monthlyCredits).toBe(300);
    expect(inner.permanentCredits).toBe(0);
  });

  it("should return 200 with only permanent credits when only permanent account exists", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440103";

    // Grant permanent credits
    await post(
      "/credits/grant/permanent",
      { userId, credits: 200 },
      authHeader,
    );

    const { status, data } = await get(
      `/credits/user/${userId}`,
      authHeader,
    );

    expect(status).toBe(200);
    const inner = (data as Record<string, unknown>).data as Record<string, unknown>;
    expect(inner.userId).toBe(userId);
    expect(inner.monthlyCredits).toBe(0);
    expect(inner.permanentCredits).toBe(200);
  });

  it("should return 401 when auth is missing", async () => {
    const userId = "550e8400-e29b-41d4-a716-446655440104";

    const { status } = await get(`/credits/user/${userId}`);

    expect(status).toBe(401);
  });
});
