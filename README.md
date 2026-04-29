# Cloudflare Worker Template

Template for building Cloudflare Workers with Hono, using a hexagonal architecture (ports and adapters).

## Stack

- Runtime: Cloudflare Workers
- Framework: Hono 4.x
- Language: TypeScript
- Tooling: Wrangler 4.x

## Project Structure

```txt
src/
	core/
		domain/                # Domain types and custom errors
		ports/                 # Interface contracts
		services/              # Business logic
	adapters/
		primary/http/          # HTTP routes, middleware, request models
		secondary/             # External implementations (e.g. logger)
	assets/                  # Static assets (for example JWT public keys)
	utils/                   # Shared utility helpers
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
- `npm run cf-typegen`: Regenerate Worker bindings types (`wrangler types --env-interface CloudflareBindings`)

Run `npm run cf-typegen` after editing bindings in `wrangler.jsonc`.

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
