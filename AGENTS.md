# Cloudflare Workers

STOP. Your knowledge of Cloudflare Workers APIs and limits may be outdated. Always retrieve current documentation before any Workers, KV, R2, D1, Durable Objects, Queues, Vectorize, AI, or Agents SDK task.

## Docs

- https://developers.cloudflare.com/workers/
- MCP: `https://docs.mcp.cloudflare.com/mcp`

For all limits and quotas, retrieve from the product's `/platform/limits/` page. eg. `/workers/platform/limits`

## Commands

| Command               | Purpose                   |
| --------------------- | ------------------------- |
| `npx wrangler dev`    | Local development         |
| `npx wrangler deploy` | Deploy to Cloudflare      |
| `npx wrangler types`  | Generate TypeScript types |

Run `wrangler types` after changing bindings in wrangler.jsonc.

## Node.js Compatibility

https://developers.cloudflare.com/workers/runtime-apis/nodejs/

## Errors

- **Error 1102** (CPU/Memory exceeded): Retrieve limits from `/workers/platform/limits/`
- **All errors**: https://developers.cloudflare.com/workers/observability/errors/

## Product Docs

Retrieve API references and limits from:
`/kv/` · `/r2/` · `/d1/` · `/durable-objects/` · `/queues/` · `/vectorize/` · `/workers-ai/` · `/agents/`

---

# [service_name] Service

## Architecture

Hexagonal Architecture (Ports & Adapters). Strict layer separation is enforced:

```
src/
├── core/
│   ├── domain/     → Entity types, custom error classes
│   ├── ports/      → Interface contracts
│   └── services/   → Business logic
└── adapters/
    ├── primary/
    │   ├── http/   → Hono routes, middleware, Zod request schemas
    │   └── rpc/    → WorkerEntrypoint RPC surfaces (trusted service-to-service)
    └── secondary/  → Database repositories, logger implements
```

### Routes

All routes are mounted in `src/adapters/primary/http/index.ts`:

- `GET /message` — plain-text greeting (no auth)
- `GET/POST /widgets`, `GET/PUT/DELETE /widgets/:id` — example CRUD (JWT auth)

### RPC Entrypoints

Named `WorkerEntrypoint`s live in `src/adapters/primary/rpc/entrypoints/` and are
re-exported from `src/index.ts` so other services can call them via service
bindings. Example: `WidgetEntrypoint.getWidgetByName`.

- Trusted service-to-service calls — **no auth middleware, no `{data}` envelope,
  no openapi paths**.
- Return typed results directly.
- Call repositories directly (bypass `AccessManagementService`).

**Rules:**

- New features go in `core/domain` (types) and `core/services` (logic)
- Adapters only handle integration — no business logic
- Inject all dependencies via constructor — no global state
- One class per file
- Domain types are camelCase (wire format); secondary adapters keep raw D1 rows
  snake_case and map to camelCase. SQL columns are never renamed.

## Stack

| Layer      | Technology                                          |
| ---------- | --------------------------------------------------- |
| Runtime    | Cloudflare Workers                                  |
| Framework  | Hono 4.x                                            |
| Validation | Zod 4.x + `@hono/standard-validator` (`sValidator`) |
| Auth       | JWT (RS256) via native Web Crypto API               |
| Testing    | Vitest + `@cloudflare/vitest-pool-workers`          |

## Build & Test Commands

| Command                | Purpose                                               |
| ---------------------- | ----------------------------------------------------- |
| `npm run dev`                   | Start local dev server (`wrangler dev`)               |
| `npm test`                      | Run test suite (`vitest run`)                         |
| `npm run test:watch`            | Run tests in watch mode (`vitest`)                    |
| `npm run test:integration`      | Run integration tests (`vitest run --config vitest.integration.config.mts`) |
| `npm run test:integration:watch`| Run integration tests in watch mode                   |
| `npm run cf-typegen`            | Regenerate types after wrangler.jsonc binding changes |
| `npm run build`                 | Build `dist/worker.js` (esbuild bundle for Terraform) |
| `npm run migrate-local`         | Apply D1 migrations to the local database             |
| `npm run migrate-dev`           | Apply D1 migrations to the deployed DEV database      |
| `npm run migrate-production`    | Apply D1 migrations to the deployed PROD database     |
| `npm run deploy-local`          | Deploy to `local` environment                         |

Run `npm run cf-typegen` after any change to bindings in `wrangler.jsonc`.

## Provisioning (GitHub Actions + Terraform)

Provisioning mirrors the card360 service convention — Terraform owns the
deployed infrastructure, CI runs it.

### Architecture

- **Terraform-first**: deployed Worker script + D1 database + all bindings are
  owned by `terraform/` (state in a shared R2 S3-compatible bucket). `npm run
  deploy` / `wrangler deploy` is NOT used in CI.
- **Worker naming**: `<service>-<env>` (env suffix always included, e.g.
  `cloudflare-worker-template-dev`); D1 database: `<service>-<env>-db`.
  Terraform creates the DB only — schema migrations are applied by the deploy
  workflow (`npx wrangler d1 migrations apply <name> --remote --env dev|production`).
- **Bundle**: `npm run build` (`scripts/build.mjs`, esbuild) → `dist/worker.js`,
  uploaded via `cloudflare_workers_script.content`. The JWT public key is NOT
  in the bundle — it is provided at runtime via the `JWT_PUBLIC_KEY` Worker
  variable (Terraform plain var from the GitHub Environment vars / `.dev.vars`
  locally).
- **Cross-service discovery**: `terraform_remote_state` data sources read the
  access-management service's state (`cardy-ai-access-management/<env>.tfstate`)
  from the same R2 bucket to resolve the `ACCESS_MGMT` worker name AND
  entrypoint — never hardcoded. The binding is omitted until the owning
  service's state contains both (`defaults = { worker_script_name = null,
  entrypoint_name = null }`; Cloudflare rejects bindings to nonexistent
  workers, error 10143).
- **State seeding**: the CI "Terraform Init State" workflows seed an EMPTY v4
  state file for THIS service's key (`cloudflare-worker-template/<env>.tfstate`,
  via idempotent `--if-none-match "*"` PUT — never overwrites existing state)
  so sibling services that read this state via `terraform_remote_state` never
  hard-fail before this service deploys. Run once per new environment.
- **`wrangler.jsonc` env blocks** (`env.dev` / `env.production`) exist ONLY so
  CLI commands can target the deployed worker + its D1 DB by name. Worker name
  and bindings are owned by Terraform; the `database_id` in these blocks is a
  placeholder that the deploy workflow patches with the real ID from Terraform
  output `d1_database_id` before running migrations.
- **Named RPC entrypoints in service bindings**: a service binding that calls
  a named `WorkerEntrypoint` (e.g. `ACCESS_MGMT` → `AccessManagementEntrypoint`)
  must declare `entrypoint` in BOTH the local `wrangler.jsonc` (root + `local`
  env), `wrangler.test.jsonc`, and the Terraform binding. If a binding omits
  the entrypoint, it resolves to the worker's default fetch handler and the
  RPC method does not exist.
- **Terraform outputs**: this service exports `worker_script_name` and
  `entrypoint_names` (map keyed by capability). Keep the `entrypoint_names`
  map in sync with `src/index.ts` when adding RPC entrypoints.

### Workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `terraform.yml` | reusable (`workflow_call`) | plan (free-running) + apply (environment-gated, downloads plan artifact, exports `d1_database_name` / `d1_database_id` / `worker_script_name`) |
| `deploy-dev.yml` / `deploy-production.yml` | `workflow_dispatch` | test gate → terraform → D1 migrations |
| `terraform-init-state-dev.yml` / `-production.yml` | `workflow_dispatch` | seed empty state for `cloudflare-worker-template/<env>` (this service's own key) |
| `terraform-plan-dev.yml` / `-production.yml` | PR → `main` | build → init → fmt check → plan → post summary comment on the PR |
| `unit-test.yml` / `integration-test.yml` | PR | reuse `Card-360/common-github-actions` worker test workflows (adjust org/repo for your team) |
| `cd.yml` | PR merged → `main` | create release via `Card-360/common-github-actions` (adjust org/repo) |
| `enforce-version-tag.yml` | PR → `main` | require version tag via `Card-360/common-github-actions` (adjust org/repo) |

### Environments / Secrets / Vars (GitHub Environments: DEV, PROD)

- Secrets: `CLOUDFLARE_API_TOKEN`, `TFSTATE_R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
- Vars: `CF_ACCOUNT_ID`, `ALLOWED_ORIGINS`, `JWT_PUBLIC_KEY`, `API_DOMAIN_HOSTNAME`, `ZONE_ID`
- The apply job is gated by "Required reviewers" configured on the environment.

### Bootstrap (one-time, per environment)

1. Create DEV/PROD environments with the secrets/vars above.
2. Run "[DEV]/[PROD] Terraform Init State".
3. Run "[DEV]/[PROD] Deploy Worker".
4. (Optional) Add required reviewers to gate apply.

## Coding Conventions

### Error Handling

- Throw custom error classes from `src/core/domain/error.ts` (never raw strings or generic Errors)
- Always log error before throwing error.
- Log with structured context objects: `logger.info('message', { userId, email })`
- HTTP status mapping is centralized in `handleError()` in the HTTP adapter — do not add status logic elsewhere

### Input Validation

- All POST/PUT/PATCH request bodies validated via Zod schemas in `src/adapters/primary/http/models/requestSchemas.ts`
- Use `sValidator('json', schema)` middleware before route handlers — never validate manually inside handlers
- Content-Type `application/json` is enforced before route execution

### Domain Naming

- Domain types are **camelCase** and define the HTTP wire format
- Secondary adapters keep raw D1 row interfaces **snake_case** (mirroring SQL
  column names) and map them to camelCase domain objects — SQL columns are
  never renamed
- Zod request schemas must use the same camelCase keys as the domain types

### Access Management service

- The connection is in the binding "ACCESS_MGMT" — it binds the
  access-management worker's NAMED RPC entrypoint (`AccessManagementEntrypoint`
  — exposes `authorize`), NOT its default fetch handler. In Terraform the
  entrypoint name is auto-discovered from the access-management state
  (`entrypoint_name` output) along with the worker name; the binding is
  omitted until BOTH are non-null.
- Checking access can be done by calling RPC `authorize`
- Example of checking access

  ```
  const principalType = c.get('principalType');
  const principalRoles = c.get('principalRoles');
  const resource = 'chat';
  const action = 'send';

  await c.env.ACCESS_MGMT.authorize(principalType, principalRoles, resource, action);
  ```

### Service Bindings

| Binding       | Local service                      | Entrypoint                 | Used by        |
| ------------- | ---------------------------------- | -------------------------- | -------------- |
| `ACCESS_MGMT` | `cardy-ai-access-management-local` | `AccessManagementEntrypoint` | HTTP routes (authorize) |

- Named RPC entrypoints must be declared in `wrangler.jsonc` (root + `local`
  env), `wrangler.test.jsonc`, and the Terraform binding — otherwise the
  binding resolves to the default fetch handler and the RPC method does not
  exist.
- Run `npm run cf-typegen` after changing bindings in `wrangler.jsonc` (both
  `wrangler.jsonc` and `wrangler.test.jsonc` must declare the same bindings).

### D1 Database

- The connection is in the binding "DB"
- Migrations live in `migrations/` (SQL files, applied in order)
- Apply migrations locally: `npm run migrate-local`
- Use `db.batch([...])` for atomic multi-statement writes (all-or-nothing)
- Raw D1 rows are snake_case; map to camelCase domain types in the repository
- Test schema is read from the real `migrations/` dir (see `vitest.integration.config.mts`)

### Retry

- Use `src/utils/retry.ts` (`retryWithExponentialBackoff`) for outbound calls
  that may fail transiently (service bindings, external HTTP)
- Pair with an **allowlist** of retryable conditions — deterministic domain
  errors must never be retried
- `RetryPolicy`: `maxAttempts`, `baseDelayMs`, `maxDelayMs`, `factor`,
  `jitterRatio` (1 = full jitter)

### API Response Format

All endpoints return a consistent JSON envelope:

```json
{ "data": { ... } }      // success
{ "error": "ErrorName" } // failure
```

No deviations from this format. (RPC entrypoints return typed results directly
— no envelope.)

### JWT

- Public key provided via the `JWT_PUBLIC_KEY` env var (Worker variable) —
  locally via `.dev.vars`, in deployed environments via Terraform (sourced
  from the GitHub Environment vars). It is never embedded in the bundle.
- RS256 via native Web Crypto (`src/utils/verifyJwt.ts`) — alg, expiry (`exp`),
  and `nbf` are checked
- Authentication middleware (`src/adapters/primary/http/middlewares/authentication.ts`)
  verifies the Bearer token and sets `principalId`, `principalType`,
  `principalRoles` on the Hono context
- The `JWT_TEST_PUBLIC_KEY` env var is injected only by the integration test
  environment (`vitest.integration.config.mts`) and overrides
  `JWT_PUBLIC_KEY` when set

### Hono Middleware

- Add global middleware via `app.use()` in `src/adapters/primary/http/index.ts` (order: logger → requestId → secureHeaders → CORS)
- Use `createMiddleware()` factory for custom middleware (see `authentication.ts`)
- Pass values through request lifecycle via `c.set('key', value)` / `c.get('key')`

## Testing

### Unit Tests (`npm test`)

- Always check if new updates break any tests.
- Always add test to covers newly added code.
- Config: `vitest.config.mts` (standard Vitest, no pool-workers for unit tests)
- Unit tests for services mock ports with lightweight test doubles (`vi.fn`, `vi.mocked`)
- Test files mirror the structure they test under `test/`
- Zod schema validation tests live in `test/models/requestSchemas.spec.ts`
- Run `npm test` before committing

### Integration Tests (`npm run test:integration`)

- Config: `vitest.integration.config.mts` uses `@cloudflare/vitest-pool-workers`
- Wrangler test config: `wrangler.test.jsonc` (separate from main wrangler config)
- Integration tests use `SELF.fetch()` from `cloudflare:test` to test against live Hono routes
- Mock external service bindings via `workers` in miniflare config within `vitest.integration.config.mts`
- Test helpers (auth, jwt) live in `test/integration/helpers/`
- Type augmentations live in `test/integration/env.d.ts` and `test/integration/globals.d.ts`
- Migrations are applied via `test/integration/apply-migrations.ts` (setup file)
- RPC entrypoints are tested via `createExecutionContext()` + `ctx.exports`; assert
  error cases with `try/catch` (not `.rejects`) to avoid unhandled rejections

### Testing RPC Entrypoints (integration)

Named `WorkerEntrypoint`s (e.g. `WidgetEntrypoint`) are obtained via
`createExecutionContext()` from `cloudflare:test` and invoked through
`ctx.exports` (requires `enable_ctx_exports`, auto-on since compatibility_date
>= 2025-11-17). See `test/integration/widgetEntrypoint.spec.ts` for the
pattern. RPC entrypoints need no Authorization header — no JWT/auth middleware
runs on them.

## Documents

- Always update openapi.yaml if needed (HTTP endpoints only — RPC entrypoints get no paths)

## Feature Plans

- Feature specs live in `.github/plans/` as `YYYYMMDDHHMMSS_feature-name.md` (created by the Feature Planning Agent).
- Implement the plan, then keep `AGENTS.md`, the `.github/agents/*`, and `.github/skills/*` in sync with any new conventions the feature introduces.
