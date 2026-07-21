## Feature: Credit System — Grant & Recall

### Requirements

- **Grant monthly credits**: Caller specifies `userId`, `credits` (int), `year` (int), `month` (int). Backend computes `effective_from` = Unix timestamp of 1st of that month 00:00:00 UTC, `expired_at` = Unix timestamp of last day of that month 23:59:59 UTC. Creates a `credit_accounts` row with `type = 'monthly'` and an accompanying `credit_ledger` row of `type = 'grant'`.
- **Grant permanent credits**: Caller specifies `userId`, `credits` (int). Creates a `credit_accounts` row with `type = 'permanent'`, `effective_from = null`, `expired_at = null`, and an accompanying `credit_ledger` row of `type = 'grant'`.
- **Recall monthly credits (full remaining)**: Caller specifies `userId`, `creditAccountId`. Backend computes remaining = `available_credits` on the account, deducts it all (sets `available_credits = 0`), and writes a `credit_ledger` row of `type = 'recall'` with `credits_delta = -remaining`.
- **Recall permanent credits (partial)**: Caller specifies `userId`, `credits` (int). Backend looks up the user's permanent credit account, deducts the specified amount (must not exceed `available_credits`), writes a `credit_ledger` row of `type = 'recall'` with `credits_delta = -credits`. No `creditAccountId` is needed from the frontend.
- **Monthly re-grant after recall**: If a monthly credit account exists for the same user+year+month but `available_credits = 0` (fully recalled), grant is allowed: the existing account's `available_credits` is topped up, `updated_at` is refreshed, and a new `credit_ledger` row is inserted. If `available_credits > 0` (not yet recalled), grant returns `ConflictError`.
- **Storage**: Cloudflare D1 (SQLite). Two tables: `credit_accounts` and `credit_ledger`. No `CHECK` constraints on string enums in the database — validation is enforced in the application layer (TypeScript types + service logic).
- **Auth**: Any authenticated principal. All four endpoints must call `ACCESS_MGMT.authorize()` — the access management service decides who is authorized, not a hardcoded role check in the routes.
- **Response envelope**: `{ "data": { ... } }` on success, `{ "error": "ErrorName" }` on failure.

---

### Domain Types (`src/core/domain/`)

**New file: `src/core/domain/credit.ts`**

```ts
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

export type CreditReferenceType = "subscription" | "admin" | "ai";

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

// ── Grant / Recall input shapes (used by service) ──

export interface MonthlyGrantInput {
  userId: string;
  credits: number;
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
```

**Update `src/core/domain/index.ts`**: add `export * from './credit';`

**New error classes** (add to `src/core/domain/error.ts`):

- `InsufficientCreditsError` — when recalling more than available. Map to 400 (BadRequestError) or add a new `ErrorName.InsufficientCreditsError` → 422. Simpler: reuse `BadRequestError` with a descriptive message. No new error enum needed if we use `BadRequestError`.

Decision: Use existing `BadRequestError` for "insufficient credits" and `NotFoundError` for "account not found". No new error class required.

---

### Port Changes (`src/core/ports/`)

**New file: `src/core/ports/creditRepository.ts`**

```ts
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
}
```

**Update `src/core/ports/index.ts`**: add `export * from './creditRepository';`

---

### Service Logic (`src/core/services/`)

**New file: `src/core/services/creditService.ts`**

```ts
export class CreditService {
  constructor(
    private readonly creditRepo: CreditRepository,
    private readonly logger: Logger,
  ) {}

  async grantMonthly(
    input: MonthlyGrantInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;
  async grantPermanent(
    input: PermanentGrantInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;
  async recallMonthly(
    input: MonthlyRecallInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;
  async recallPermanent(
    input: PermanentRecallInput,
  ): Promise<{ account: CreditAccount; ledger: CreditLedger }>;
}
```

**Key business logic:**

1. **`grantMonthly`**:
   - Compute `effectiveFrom` = `Date.UTC(year, month-1, 1) / 1000`
   - Compute `expiredAt` = `Date.UTC(year, month, 0, 23, 59, 59) / 1000` (last day of month)
   - Look up existing account via `creditRepo.getMonthlyAccountByUserAndPeriod()`
   - **If no account exists**: generate UUIDs, build `CreditAccount` + `CreditLedger`, call `creditRepo.grantCredits()`
   - **If account exists AND `availableCredits === 0`** (fully recalled): generate a new ledger UUID, build `CreditLedger`, call `creditRepo.reGrantCredits()` to top-up the account — `newAvailable = account.availableCredits + input.credits`, `additionalCredits = input.credits`
   - **If account exists AND `availableCredits > 0`** (not yet recalled): throw `ConflictError("Monthly credit already granted for this period")`
   - Log and return

2. **`grantPermanent`**:
   - Generate UUIDs
   - Build `CreditAccount` with `effectiveFrom = null`, `expiredAt = null`
   - Build `CreditLedger` with `referenceType = 'admin'`
   - Call `creditRepo.grantCredits()`
   - Log and return

3. **`recallMonthly`**:
   - Fetch account via `creditRepo.getAccountById()` → throw `NotFoundError` if missing
   - Validate `account.type === 'monthly'` → throw `BadRequestError` if not
   - Validate `account.userId === input.userId` → throw `ForbiddenError` if mismatch
   - Compute `remaining = account.availableCredits`
   - If `remaining <= 0` → throw `BadRequestError("No remaining credits to recall")`
   - Build `CreditLedger` with `creditsDelta = -remaining`
   - Call `creditRepo.recallCredits()` setting `newAvailable = 0`
   - Log and return

4. **`recallPermanent`**:
   - Look up account via `creditRepo.getPermanentAccountByUserId(input.userId)` → throw `NotFoundError` if no permanent account exists
   - Validate `account.type === 'permanent'` → `BadRequestError` if not
   - Validate `input.credits <= account.availableCredits` → `BadRequestError("Insufficient credits")`
   - Build `CreditLedger` with `creditsDelta = -input.credits`
   - Compute `newAvailable = account.availableCredits - input.credits`
   - Call `creditRepo.recallCredits()`
   - Log and return

---

### HTTP Adapter (`src/adapters/primary/http/`)

#### Routes (`src/adapters/primary/http/index.ts`)

Mount a new route group with the `authenticationMiddleware` applied:

```ts
import { creditRoutes } from "./routes/credits";

// ... after existing middleware ...

app.route("/admin/credits", creditRoutes);
```

**New file: `src/adapters/primary/http/routes/credits.ts`**

Four POST endpoints, all behind `authenticationMiddleware()`:

| Method | Path                              | Handler                  | Access                                         |
| ------ | --------------------------------- | ------------------------ | ---------------------------------------------- |
| POST   | `/admin/credits/grant/monthly`    | `grantMonthlyHandler`    | `resource='credit', action='grant_monthly'`    |
| POST   | `/admin/credits/grant/permanent`  | `grantPermanentHandler`  | `resource='credit', action='grant_permanent'`  |
| POST   | `/admin/credits/recall/monthly`   | `recallMonthlyHandler`   | `resource='credit', action='recall_monthly'`   |
| POST   | `/admin/credits/recall/permanent` | `recallPermanentHandler` | `resource='credit', action='recall_permanent'` |

Each handler:

1. Extracts `principalType` / `principalRoles` from context
2. Calls `ACCESS_MGMT.authorize(principalType, principalRoles, 'credit', '<action>')`
3. Parses body via Zod (already done if using `sValidator`)
4. Calls `CreditService` method
5. Returns `c.json({ data: { account, ledger } }, 201)`

#### Zod Schemas (`src/adapters/primary/http/models/requestSchemas.ts`)

```ts
import { z } from "zod";

export const grantMonthlySchema = z.object({
  userId: z.string().uuid(),
  credits: z.number().int().positive(),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
});

export const grantPermanentSchema = z.object({
  userId: z.string().uuid(),
  credits: z.number().int().positive(),
});

export const recallMonthlySchema = z.object({
  userId: z.string().uuid(),
  creditAccountId: z.string().uuid(),
});

export const recallPermanentSchema = z.object({
  userId: z.string().uuid(),
  credits: z.number().int().positive(),
});
```

#### Middleware / Dependency Injection

The `CreditService` needs to be instantiated with a `CreditRepository`. Since Workers have no traditional DI container, instantiate in a helper or inline:

```ts
// In routes/credits.ts or a shared helper
import { CreditService } from "../../../core/services/creditService";
import { D1CreditRepository } from "../../../adapters/secondary/d1CreditRepository";
import { DefaultLogger } from "../../../adapters/secondary/loggers";

function getCreditService(c: Context<AppEnv>): CreditService {
  return new CreditService(
    new D1CreditRepository(c.env.CREDIT_DB),
    new DefaultLogger(),
  );
}
```

#### `AppEnv` type update (`src/adapters/primary/http/types.ts`)

Add `CREDIT_DB: D1Database` to the `Bindings`:

```ts
export type AppEnv = {
  Bindings: CloudflareBindings & {
    ALLOWED_ORIGINS: string;
    ACCESS_MGMT: Fetcher & AccessManagementService;
    CREDIT_DB: D1Database;
  };
  Variables: AppVariables;
};
```

---

### Secondary Adapters (`src/adapters/secondary/`)

**New file: `src/adapters/secondary/d1CreditRepository.ts`**

Implements `CreditRepository` using D1's SQL API:

```ts
export class D1CreditRepository implements CreditRepository {
  constructor(private readonly db: D1Database) {}

  async createAccount(account: CreditAccount): Promise<CreditAccount> { ... }
  async getAccountById(id: string): Promise<CreditAccount | null> { ... }
  async getMonthlyAccountByUserAndPeriod(userId: string, effectiveFrom: number, expiredAt: number): Promise<CreditAccount | null> { ... }
  async getPermanentAccountByUserId(userId: string): Promise<CreditAccount | null> { ... }
  async updateAccountCredits(id: string, newAvailable: number, updatedAt: number): Promise<void> { ... }
  async createLedger(entry: CreditLedger): Promise<CreditLedger> { ... }

  // Transactional: uses D1's batch() for atomicity
  async grantCredits(account: CreditAccount, ledger: CreditLedger): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    // batch([ INSERT account, INSERT ledger ])
  }

  async reGrantCredits(accountId: string, ledger: CreditLedger, additionalCredits: number, newAvailable: number, updatedAt: number): Promise<{ account: CreditAccount; ledger: CreditLedger }> {
    // batch([ UPDATE account SET available_credits = newAvailable, updated_at = updatedAt, INSERT ledger ])
    // then re-read account by id and return
  }

  async recallCredits(accountId: string, ledger: CreditLedger, newAvailable: number, updatedAt: number): Promise<{ ledger: CreditLedger }> {
    // batch([ UPDATE account SET available_credits, updated_at, INSERT ledger ])
  }
}
```

**D1 Table schema** (run as migration — suggested migration file: `migrations/0001_credit_tables.sql`):

```sql
CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  available_credits INTEGER NOT NULL DEFAULT 0,
  effective_from INTEGER,
  expired_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_credit_accounts_user_id ON credit_accounts(user_id);
CREATE UNIQUE INDEX idx_monthly_account_unique ON credit_accounts(user_id, effective_from, expired_at) WHERE type = 'monthly';

CREATE TABLE IF NOT EXISTS credit_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  credits_delta INTEGER NOT NULL,
  reference_type TEXT NOT NULL,
  reference_id TEXT NOT NULL,
  credit_account_id TEXT NOT NULL REFERENCES credit_accounts(id),
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX idx_credit_ledger_account_id ON credit_ledger(credit_account_id);
```

---

### Bindings and Configuration

#### `wrangler.jsonc` — add D1 binding

```jsonc
{
  "d1_databases": [
    {
      "binding": "CREDIT_DB",
      "database_name": "cardy-ai-credit-db",
      "database_id": "<created-by-wrangler-d1-create>",
    },
  ],
}
```

#### `wrangler.test.jsonc` — add test D1 binding (in-memory or separate test DB)

```jsonc
{
  "d1_databases": [
    {
      "binding": "CREDIT_DB",
      "database_name": "cardy-ai-credit-db-test",
      "database_id": "test-db",
    },
  ],
}
```

#### `worker-configuration.d.ts` — regenerate via `npm run cf-typegen` after wrangler.jsonc changes

#### `vitest.integration.config.mts` — add D1 in Miniflare config:

```ts
miniflare: {
  d1Databases: ['CREDIT_DB'],
  // ...
}
```

---

### Access Control

All four endpoints require authorization via `ACCESS_MGMT.authorize()`. The access management service itself determines who is authorized — there is no hardcoded role check (e.g., "admin") in the route handlers. Any principal that passes the authorize call can grant or recall credits.

Access check pattern:

```ts
const principalType = c.get("principalType");
const principalRoles = c.get("principalRoles");
await c.env.ACCESS_MGMT.authorize(
  principalType,
  principalRoles,
  "credit",
  "<action>",
);
```

| Endpoint                             | Resource | Action             |
| ------------------------------------ | -------- | ------------------ |
| POST /admin/credits/grant/monthly    | `credit` | `grant_monthly`    |
| POST /admin/credits/grant/permanent  | `credit` | `grant_permanent`  |
| POST /admin/credits/recall/monthly   | `credit` | `recall_monthly`   |
| POST /admin/credits/recall/permanent | `credit` | `recall_permanent` |

---

### Test Plan

#### Unit Tests (`test/services/creditService.spec.ts`)

- Mock `CreditRepository` with `vi.fn()`
- Mock `Logger` with `vi.fn()`

| Test case                                                             | What it verifies                                                   |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `grantMonthly` creates account with correct dates                     | effective_from = 1st, expired_at = last day                        |
| `grantMonthly` re-grants after recall (available_credits = 0)         | existing account topped-up, new ledger entry created                |
| `grantMonthly` throws `ConflictError` on duplicate with credits left  | existing account with available > 0, no re-grant allowed            |
| `grantMonthly` throws on invalid year/month range                     | Zod validation catches before service                              |
| `grantPermanent` creates account with null dates                      | effective_from & expired_at are null                               |
| `grantPermanent` successfully creates for any credits amount          | basic flow                                                         |
| `recallMonthly` deducts all remaining credits                         | available_credits → 0, ledger delta = -remaining                   |
| `recallMonthly` throws `NotFoundError` for missing account            | account lookup failure                                             |
| `recallMonthly` throws `ForbiddenError` if userId mismatch            | cross-user protection                                              |
| `recallMonthly` throws `BadRequestError` if account type is permanent | type mismatch                                                      |
| `recallMonthly` throws `BadRequestError` if no remaining credits      | available = 0                                                      |
| `recallPermanent` deducts specified credits                           | partial recall via getPermanentAccountByUserId lookup               |
| `recallPermanent` throws `NotFoundError` if no permanent account      | getPermanentAccountByUserId returns null                           |
| `recallPermanent` throws `BadRequestError` if insufficient credits    | recall > available                                                 |

#### Integration Tests (`test/integration/credits.spec.ts`)

Use `SELF.fetch()` with auth headers from `getAuthorizationHeader('user', ['admin'])`.

| Test case                                              | HTTP assertion                                                |
| ------------------------------------------------------ | ------------------------------------------------------------- |
| POST /admin/credits/grant/monthly — success            | 201, body has `{ data: { account, ledger } }`                 |
| POST /admin/credits/grant/monthly — recall then re-grant | recall → 200, re-grant → 201, same account ID, credits topped up |
| POST /admin/credits/grant/monthly — duplicate with credits left | 409, `{ error: "ConflictError" }`                      |
| POST /admin/credits/grant/monthly — missing auth       | 401                                                           |
| POST /admin/credits/grant/monthly — invalid body       | 400                                                           |
| POST /admin/credits/grant/permanent — success          | 201                                                           |
| POST /admin/credits/recall/monthly — success           | 200, `available_credits` = 0                                  |
| POST /admin/credits/recall/monthly — account not found | 404                                                           |
| POST /admin/credits/recall/permanent — partial success | 200 (no creditAccountId in request body)                      |
| POST /admin/credits/recall/permanent — insufficient    | 400                                                           |
| POST /admin/credits/recall/permanent — no account      | 404                                                           |
| Unauthorized principal                                 | 403 (from ACCESS_MGMT mock throwing when unauthorized)        |

**Test helper updates:**

- Update `vitest.integration.config.mts` Miniflare mock for ACCESS_MGMT to throw `ForbiddenError` when the test provides unauthorized roles, and pass-through when authorized
- Add D1 migration execution in test setup (or rely on Miniflare's D1 to auto-migrate)

---

### openapi.yaml Changes

Add the following paths under `/admin/credits`:

```yaml
/admin/credits/grant/monthly:
  post:
    operationId: grantMonthlyCredits
    summary: Grant monthly credits to a user (re-grants if fully recalled)
    security: [{ bearerAuth: [] }]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [userId, credits, year, month]
            properties:
              userId: { type: string, format: uuid }
              credits: { type: integer, minimum: 1 }
              year: { type: integer, minimum: 2000, maximum: 2100 }
              month: { type: integer, minimum: 1, maximum: 12 }
    responses:
      "201":
        {
          description: Credits granted,
          content:
            {
              application/json:
                { schema: { $ref: "#/components/schemas/GrantResponse" } },
            },
        }
      "400": { $ref: "#/components/responses/BadRequest" }
      "401": { $ref: "#/components/responses/Unauthorized" }
      "403": { $ref: "#/components/responses/Forbidden" }
      "409": { $ref: "#/components/responses/Conflict" }

/admin/credits/grant/permanent:
  post:
    operationId: grantPermanentCredits
    summary: Grant permanent credits to a user
    security: [{ bearerAuth: [] }]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [userId, credits]
            properties:
              userId: { type: string, format: uuid }
              credits: { type: integer, minimum: 1 }
    responses:
      "201":
        {
          description: Credits granted,
          content:
            {
              application/json:
                { schema: { $ref: "#/components/schemas/GrantResponse" } },
            },
        }
      "400": { $ref: "#/components/responses/BadRequest" }
      "401": { $ref: "#/components/responses/Unauthorized" }
      "403": { $ref: "#/components/responses/Forbidden" }

/admin/credits/recall/monthly:
  post:
    operationId: recallMonthlyCredits
    summary: Recall all remaining monthly credits
    security: [{ bearerAuth: [] }]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [userId, creditAccountId]
            properties:
              userId: { type: string, format: uuid }
              creditAccountId: { type: string, format: uuid }
    responses:
      "200":
        {
          description: Credits recalled,
          content:
            {
              application/json:
                { schema: { $ref: "#/components/schemas/RecallResponse" } },
            },
        }
      "400": { $ref: "#/components/responses/BadRequest" }
      "401": { $ref: "#/components/responses/Unauthorized" }
      "403": { $ref: "#/components/responses/Forbidden" }
      "404": { $ref: "#/components/responses/NotFound" }

/admin/credits/recall/permanent:
  post:
    operationId: recallPermanentCredits
    summary: Partially recall permanent credits (looked up by userId)
    security: [{ bearerAuth: [] }]
    requestBody:
      required: true
      content:
        application/json:
          schema:
            type: object
            required: [userId, credits]
            properties:
              userId: { type: string, format: uuid }
              credits: { type: integer, minimum: 1 }
    responses:
      "200":
        {
          description: Credits recalled,
          content:
            {
              application/json:
                { schema: { $ref: "#/components/schemas/RecallResponse" } },
            },
        }
      "400": { $ref: "#/components/responses/BadRequest" }
      "401": { $ref: "#/components/responses/Unauthorized" }
      "403": { $ref: "#/components/responses/Forbidden" }
      "404": { $ref: "#/components/responses/NotFound" }
```

**New component schemas:**

```yaml
CreditAccount:
  type: object
  properties:
    id: { type: string, format: uuid }
    userId: { type: string, format: uuid }
    type: { type: string, enum: [monthly, permanent] }
    availableCredits: { type: integer }
    effectiveFrom:
      { type: integer, nullable: true, description: Unix timestamp }
    expiredAt: { type: integer, nullable: true, description: Unix timestamp }
    updatedAt: { type: integer }

CreditLedger:
  type: object
  properties:
    id: { type: string, format: uuid }
    userId: { type: string, format: uuid }
    type: { type: string, enum: [grant, charge, refund, recall] }
    creditsDelta: { type: integer }
    referenceType: { type: string, enum: [subscription, admin, ai] }
    referenceId: { type: string, format: uuid }
    creditAccountId: { type: string, format: uuid }
    createdAt: { type: integer }

GrantResponse:
  type: object
  properties:
    account: { $ref: "#/components/schemas/CreditAccount" }
    ledger: { $ref: "#/components/schemas/CreditLedger" }

RecallResponse:
  type: object
  properties:
    account: { $ref: "#/components/schemas/CreditAccount" }
    ledger: { $ref: "#/components/schemas/CreditLedger" }
```

**New response refs to add** under `components/responses` (if not already present):

```yaml
BadRequest:
  {
    description: Bad Request,
    content:
      {
        application/json:
          { schema: { $ref: "#/components/schemas/ErrorResponse" } },
      },
  }
Unauthorized:
  {
    description: Unauthorized,
    content:
      {
        application/json:
          { schema: { $ref: "#/components/schemas/ErrorResponse" } },
      },
  }
Forbidden:
  {
    description: Forbidden,
    content:
      {
        application/json:
          { schema: { $ref: "#/components/schemas/ErrorResponse" } },
      },
  }
NotFound:
  {
    description: Not Found,
    content:
      {
        application/json:
          { schema: { $ref: "#/components/schemas/ErrorResponse" } },
      },
  }
Conflict:
  {
    description: Conflict,
    content:
      {
        application/json:
          { schema: { $ref: "#/components/schemas/ErrorResponse" } },
      },
  }
```

---

### Files to Create / Modify Summary

| Action     | File                                                                        |
| ---------- | --------------------------------------------------------------------------- |
| **CREATE** | `src/core/domain/credit.ts`                                                 |
| **MODIFY** | `src/core/domain/index.ts`                                                  |
| **CREATE** | `src/core/ports/creditRepository.ts`                                        |
| **MODIFY** | `src/core/ports/index.ts`                                                   |
| **CREATE** | `src/core/services/creditService.ts`                                        |
| **CREATE** | `src/adapters/primary/http/routes/credits.ts`                               |
| **MODIFY** | `src/adapters/primary/http/index.ts`                                        |
| **MODIFY** | `src/adapters/primary/http/models/requestSchemas.ts` (create if not exists) |
| **MODIFY** | `src/adapters/primary/http/types.ts`                                        |
| **CREATE** | `src/adapters/secondary/d1CreditRepository.ts`                              |
| **CREATE** | `migrations/0001_credit_tables.sql`                                         |
| **MODIFY** | `wrangler.jsonc`                                                            |
| **MODIFY** | `wrangler.test.jsonc`                                                       |
| **MODIFY** | `vitest.integration.config.mts`                                             |
| **CREATE** | `test/services/creditService.spec.ts`                                       |
| **CREATE** | `test/integration/credits.spec.ts`                                          |
| **MODIFY** | `openapi.yaml`                                                              |
| **RUN**    | `npm run cf-typegen` (after wrangler.jsonc changes)                         |
