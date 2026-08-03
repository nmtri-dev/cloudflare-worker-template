# Cloudflare Worker Template

Template for building Cloudflare Workers with Hono, using a hexagonal architecture (ports and adapters).

## Stack

- Runtime: Cloudflare Workers
- Framework: Hono 4.x
- Language: TypeScript
- Tooling: Wrangler 4.x
- Database: D1 (SQLite)
- Validation: Zod 4.x + `@hono/standard-validator`

## Project Structure

```txt
src/
	core/
		domain/                # Domain types and custom errors
		ports/                 # Interface contracts
		services/              # Business logic
	adapters/
		primary/
			http/              # HTTP routes, middleware, request models
			rpc/               # WorkerEntrypoint RPC surfaces (service-to-service)
		secondary/             # External implementations (e.g. D1 repos, logger)
	assets/                  # Static assets (for example JWT public keys)
	utils/                   # Shared utility helpers (e.g. retry)
migrations/                # D1 SQL migrations (applied in order)
```

## Prerequisites

- Node.js 20+
- npm
- Cloudflare account and `wrangler` authentication for deployment

## Getting Started

Install dependencies:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

The Worker runs on Wrangler's local development server (typically `http://localhost:8787`).

## Available Scripts

- `npm run dev`: Start local development server (`wrangler dev`)
- `npm run deploy`: Deploy Worker (`wrangler deploy --minify`)
- `npm run deploy-local`: Deploy using local environment (`wrangler deploy --minify -e=local`)
- `npm run migrate-local`: Apply D1 migrations to the local database
- `npm test`: Run unit tests (`vitest run`)
- `npm run test:watch`: Run unit tests in watch mode (`vitest`)
- `npm run test:integration`: Run integration tests (`vitest run --config vitest.integration.config.mts`)
- `npm run test:integration:watch`: Run integration tests in watch mode
- `npm run cf-typegen`: Regenerate Worker bindings types (`wrangler types --env-interface CloudflareBindings`)

Run `npm run cf-typegen` after editing bindings in `wrangler.jsonc`.

## Example Domain

The template ships a minimal generic **widget** example to demonstrate the
conventions:

- `src/core/domain/widget.ts` — domain types (camelCase wire format)
- `src/core/ports/widgetRepository.ts` — repository port
- `src/core/services/widgetService.ts` — business logic (auth + logging)
- `src/adapters/secondary/d1WidgetRepository.ts` — D1 implementation
- `src/adapters/primary/http/routes/widget.ts` — HTTP CRUD routes
- `src/adapters/primary/rpc/entrypoints/widgetEntrypoint.ts` — RPC surface

Delete these files (and the `widgets` migration) when starting a real service.

## Configuration

Main Worker configuration is in `wrangler.jsonc`.

Current bindings and variables:

- Variable `ALLOWED_ORIGINS` for CORS origin allowlist (comma-separated)
- Service binding `ACCESS_MGMT` for access authorization RPC

Environments:

- Default environment
- `local` environment override under `env.local`

## HTTP Layer

The app entrypoint is `src/adapters/primary/http/index.ts`.

Registered global middleware order:

1. Hono logger
2. Request ID middleware
3. Secure headers
4. CORS middleware

Centralized error handling is configured with `app.onError(handleError)`.

## API

OpenAPI spec is available at `openapi.yaml`.

Current endpoint:

- `GET /message`: Returns plain text `Hello Hono!`

Error response format is standardized as:

```json
{ "error": "ErrorName" }
```

Defined error names:

- `InternalError`
- `BadRequestError`
- `UnauthorizedError`
- `NotFoundError`
- `ConflictError`
- `ForbiddenError`

## Architecture Guidelines

- Keep business logic in `src/core/services`
- Keep adapters focused on integration concerns only
- Use constructor-based dependency injection
- Use one class per file

## Extending This Template

When adding a new feature:

1. Define domain models/errors in `src/core/domain`
2. Define or update interfaces in `src/core/ports`
3. Implement business use cases in `src/core/services`
4. Add HTTP route/schema/middleware wiring in `src/adapters/primary/http`
5. Add or update adapter implementations in `src/adapters/secondary`
6. Update `openapi.yaml` to reflect API changes
7. Add corresponding unit and integration tests in `test/`

## Testing

This template includes both unit tests and integration tests.

### Unit Tests

Standard Vitest with no pool-workers. Used for isolated testing of services, with dependencies mocked via `vi.fn` / `vi.mocked`.

```bash
npm test              # run once
npm run test:watch    # watch mode
```

Tests live in `test/` and mirror the source structure. Example: `test/services/example.spec.ts`.

### Integration Tests

Uses `@cloudflare/vitest-pool-workers` to run the Worker in a real miniflare sandbox. Tests use `SELF.fetch()` from `cloudflare:test` to make real HTTP requests against live Hono routes.

```bash
npm run test:integration           # run once
npm run test:integration:watch     # watch mode
```

Configuration files:

| File | Purpose |
|------|---------|
| `vitest.integration.config.mts` | Integration Vitest config with `cloudflareTest` plugin |
| `wrangler.test.jsonc` | Miniflare test environment (bindings, vars, services) |
| `test/integration/env.d.ts` | TypeScript env augmentation for `cloudflare:test` |
| `test/integration/globals.d.ts` | Global type augmentations (typed `res.json<T>()`) |
| `test/integration/helpers/auth.ts` | Helper to generate Authorization headers |
| `test/integration/helpers/jwt.ts` | JWT generation for test contexts |

Mock external service bindings (e.g., `ACCESS_MGMT`) via the `workers` option in `vitest.integration.config.mts`.

## Deployment

Deploy to Cloudflare:

```bash
npm run deploy
```

Deploy with local environment config:

```bash
npm run deploy-local
```

## Custom Agents

This repository includes custom Copilot agents under `.github/agents/` to standardize planning and review workflows.

Available agents:

- `Feature Planning Agent` (`.github/agents/plan-feature.agent.md`)
	- Use for feature scoping and technical planning before implementation.
	- Produces a structured feature spec covering domain, ports, services, adapters, tests, and `openapi.yaml` updates.
- `Code Review Agent` (`.github/agents/review-code.agent.md`)
	- Use for structured code reviews of diffs and PRs.
	- Focuses on correctness, architecture boundaries, error handling, security, tests, and API contract consistency.
- `Security Review Agent` (`.github/agents/security-review.agent.md`)
	- Use for threat modeling and vulnerability analysis.
	- Focuses on OWASP Top 10 checks, authn/authz coverage, injection risks, data exposure, and Cloudflare-specific concerns.

Suggested workflow:

1. Start with `Feature Planning Agent` for a new capability.
2. Implement the feature.
3. Run `Code Review Agent` on the resulting changes.
4. Run `Security Review Agent` before merge/deploy.

Notes:

- Agent instructions are project-specific and aligned with `AGENTS.md` conventions.
- Keep agent files in `.github/agents/` so they stay versioned with the codebase.
- Keep updating the agents' instructions periodically, to match with latest structure of project

## References

- Cloudflare Workers docs: https://developers.cloudflare.com/workers/
- Wrangler config docs: https://developers.cloudflare.com/workers/wrangler/configuration/
- Hono docs: https://hono.dev/
