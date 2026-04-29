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
    ├── primary/http/   → Hono routes, middleware, Zod request schemas
    └── secondary/      → Database repositories, logger implements
```

### Routes

All routes are mounted in `src/adapters/primary/http/index.ts`:

- routes

**Rules:**

- New features go in `core/domain` (types) and `core/services` (logic)
- Adapters only handle integration — no business logic
- Inject all dependencies via constructor — no global state
- One class per file

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
| `npm run dev`          | Start local dev server (`wrangler dev`)               |
| `npm test`             | Run test suite (`vitest run`)                         |
| `npm run test:watch`   | Run tests in watch mode (`vitest`)                    |
| `npm run cf-typegen`   | Regenerate types after wrangler.jsonc binding changes |
| `npm run deploy-local` | Deploy to `local` environment                         |

Run `npm run cf-typegen` after any change to bindings in `wrangler.jsonc`.

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

### Access Management service

- The connection is in the binding "ACCESS_MGMT"
- Checking access can be done by calling RPC `authorize`
- Example of checking access

  ```
  const principalType = c.get('principalType');
  const principalRoles = c.get('principalRoles');
  const resource = 'chat';
  const action = 'send';

  await c.env.ACCESS_MGMT.authorize(principalType, principalRoles, resource, action);
  ```

### API Response Format

All endpoints return a consistent JSON envelope:

```json
{ "data": { ... } }      // success
{ "error": "ErrorName" } // failure
```

No deviations from this format.

### JWT

- Public key served from assets for verification

### Hono Middleware

- Add global middleware via `app.use()` in `src/adapters/primary/http/index.ts` (order: logger → requestId → secureHeaders → CORS)
- Use `createMiddleware()` factory for custom middleware (see `authentication.ts`)
- Pass values through request lifecycle via `c.set('key', value)` / `c.get('key')`

## Testing

- Always check if new updates break any tests.
- Always add test to covers newly added code.
- Tests live in `test/` and use `SELF.fetch()` for integration testing against live Hono routes
- Config: `vitest.config.mts` (standard Vitest, no pool-workers for unit tests)
- Unit tests for services mock ports with lightweight test doubles (`vi.fn`, `vi.mocked`)
- Test files mirror the structure they test
- Zod schema validation tests live in `test/models/requestSchemas.spec.ts`
- Run `npm test` before committing

## Documents

- Always update openapi.yaml if needed
