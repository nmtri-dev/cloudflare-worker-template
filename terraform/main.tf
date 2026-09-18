terraform {
  required_version = ">= 1.5"
  required_providers {
    cloudflare = {
      # ~> 5.23.0 required: v5.23.0 fixed the v4→v5 D1 state upgrader to
      # initialize read_replication = {mode: "disabled"} instead of null.
      # Earlier v5.x sends null in the D1 update (PUT) request, which the API
      # rejects with 400 "Invalid property: read_replication => Expected
      # object, received null" (see cloudflare/terraform-provider-cloudflare
      # #7171 / fix commit 298799b).
      source  = "cloudflare/cloudflare"
      version = "~> 5.23.0"
    }
  }
}

provider "cloudflare" {
  # Falls back to the CLOUDFLARE_API_TOKEN environment variable when the
  # variable is unset (null).
  api_token = var.cloudflare_api_token
}

# ---------------------------------------------------------------------------
# Remote state (cross-service discovery)
#
# The worker reads the access-management service's state from the same R2
# state bucket to resolve the ACCESS_MGMT worker name automatically. The CI
# "Terraform Init State" workflow seeds EMPTY state files for the
# access-management key before this service is ever deployed, so this data
# source never hard-fails: with the file present but empty, `defaults` (null)
# is returned for every output until the owning service actually deploys and
# writes real state.
# ---------------------------------------------------------------------------
locals {
  # The S3 backend config is shared with backend.tf / the CI -backend-config
  # args. Keys are passed per environment so we read the same state the other
  # services deploy with.
  remote_state_backend_config = {
    bucket = var.tfstate_r2_bucket
    region = "auto"
    endpoints = {
      s3 = "https://${var.account_id}.r2.cloudflarestorage.com"
    }
    access_key = var.tfstate_r2_access_key
    secret_key = var.tfstate_r2_secret_key
    # R2 (S3-compatible) skips — must match backend.tf exactly, or the
    # remote state backend refuses to init ("backend configuration mismatch").
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }

  # The access-management service's state key follows the same naming
  # convention as this service's own key: <service>/<env>.tfstate.
  # Derived here — no need to pass it in from CI.
  access_mgmt_state_key = "cardy360-access-management/${var.environment}.tfstate"
}

data "terraform_remote_state" "access_mgmt" {
  backend = "s3"
  config  = merge(local.remote_state_backend_config, { key = local.access_mgmt_state_key })

  # Defaults only take effect when the state file EXISTS but has no outputs.
  # The CI init-state workflow guarantees the file exists (seeded empty), so
  # before access-management's first apply every output below is null (the
  # service binding is omitted until the owning service deploys — the binding
  # is conditional on its state containing the worker name and entrypoint).
  defaults = {
    worker_script_name = null
    entrypoint_name    = null
  }
}

# The ACCESS_MGMT service binding is only added once the access-management
# service's state actually contains its worker name AND entrypoint. With the
# seeded (empty) state these outputs are null, so the binding is simply
# omitted — Cloudflare rejects service bindings to null/nonexistent workers
# (error 10143). After access-management deploys, a later apply adds the
# binding automatically.
locals {
  access_mgmt_worker_name = data.terraform_remote_state.access_mgmt.outputs.worker_script_name
  access_mgmt_entrypoint  = data.terraform_remote_state.access_mgmt.outputs.entrypoint_name

  # The access-management worker exposes its `authorize` RPC via the named
  # entrypoint `AccessManagementEntrypoint` (defined in the access-management
  # service code) — the entrypoint name comes from its Terraform state
  # (`entrypoint_name` output), just like the worker name. Both must be
  # non-null before the binding is included.
  access_mgmt_binding = local.access_mgmt_worker_name != null && local.access_mgmt_entrypoint != null ? [
    {
      name       = "ACCESS_MGMT"
      type       = "service"
      service    = local.access_mgmt_worker_name
      entrypoint = local.access_mgmt_entrypoint
    },
  ] : []
}

# ---------------------------------------------------------------------------
# D1 database
#
# Terraform creates the database only. The schema is NOT managed here —
# migrations are applied by the deploy workflow:
#   npx wrangler d1 migrations apply cloudflare-worker-template-<env>-db --remote
# (both environments follow the `cloudflare-worker-template-<env>-db` naming,
# matching the Worker script name which also always includes the env suffix).
# ---------------------------------------------------------------------------
resource "cloudflare_d1_database" "worker_db" {
  account_id = var.account_id
  name       = "cloudflare-worker-template-${var.environment}-db"

  # Explicitly disable read replication. In the v5 provider this is a nested
  # attribute (object), so it must be assigned with `=` — block syntax
  # (`read_replication { ... }`) is not valid for it.
  read_replication = {
    mode = "disabled"
  }
}

# ---------------------------------------------------------------------------
# Worker script — owns the code bundle + all bindings (Terraform-first)
#
# `content` is the bundled `dist/worker.js` (built with `npm run build`).
# The JWT public key is a plain Worker variable (`JWT_PUBLIC_KEY` binding)
# sourced from the GitHub Environment vars — it is not embedded in the bundle.
#
# The environment suffix is ALWAYS included in the worker name
# (cloudflare-worker-template-<env>) so dev and production are never
# ambiguous.
#
# This worker has NO secrets — the ACCESS_MGMT binding is a service binding
# (outbound), and JWT verification uses the JWT_PUBLIC_KEY plain var.
#
# The ACCESS_MGMT binding targets the access-management worker's NAMED RPC
# entrypoint (`AccessManagementEntrypoint` — exposes `authorize`), not its
# default fetch handler. HTTP routes call `c.env.ACCESS_MGMT.authorize(...)`;
# without the entrypoint the binding resolves to the default handler and the
# RPC method does not exist.
# ---------------------------------------------------------------------------
resource "cloudflare_workers_script" "worker" {
  account_id  = var.account_id
  script_name = "cloudflare-worker-template-${var.environment}"

  content             = file("${path.module}/../dist/worker.js")
  main_module         = "worker.js"
  compatibility_date  = "2026-04-29"
  compatibility_flags = ["nodejs_compat"]

  # Workers Logs & Traces. `enabled: true` is what enables Workers Logs for
  # the deployed script; `logs`/`traces` control sampling, persistence, and
  # invocation logs. Keep in sync with the root `observability` block in
  # wrangler.jsonc (which drives local `wrangler dev` and is what `wrangler
  # tail -e=local` reads).
  observability = {
    enabled            = true
    head_sampling_rate = 1
    logs = {
      enabled            = true
      head_sampling_rate = 1
      invocation_logs    = true
      persist            = true
    }
    traces = {
      enabled            = false
      head_sampling_rate = 1
      persist            = true
    }
  }

  # D1 + plain vars + rate limiter + service bindings (ACCESS_MGMT is
  # conditional on the owning service's remote state containing its worker
  # name AND entrypoint).
  bindings = concat([
    # D1
    {
      name = "DB"
      type = "d1"
      id   = cloudflare_d1_database.worker_db.id
    },
    # Plain vars
    {
      name = "ALLOWED_ORIGINS"
      type = "plain_text"
      text = var.allowed_origins
    },
    {
      name = "JWT_PUBLIC_KEY"
      type = "plain_text"
      text = var.jwt_public_key
    },
    # Native Workers rate limiting binding — a per-principal budget (calls to
    # `limit()` per 60 s per key, where the key is the principal ID).
    # namespace_id and budget are environment-specific (see the
    # rate_limit_namespace_id / rate_limit_limit variables — the namespace_id
    # is unique per account AND per environment, so dev and prod counters
    # never share state).
    {
      name         = "RATE_LIMITER"
      type         = "ratelimit"
      namespace_id = var.rate_limit_namespace_id
      simple = {
        limit  = var.rate_limit_limit
        period = 60
      }
    },
    ],
    # Service binding — included only when access-management's Terraform state
    # contains the worker name AND entrypoint, so the binding appears
    # automatically once that service deploys — no manual toggle needed.
    # Cloudflare rejects service bindings to null/nonexistent workers (error
    # 10143), so the binding is always omitted while the owning state is empty
    # (seeded).
    #
    # The target worker name + entrypoint come from the access-management
    # service's Terraform state (auto-discovery via terraform_remote_state) —
    # the owning service is the single source of truth for its worker name
    # and RPC entrypoint. The CI "Terraform Init State" workflow must have
    # seeded the empty state file before the first deploy so this data source
    # never hard-fails.
    local.access_mgmt_binding,
  )
}

# ---------------------------------------------------------------------------
# Custom domain — public HTTP entrypoint for the Worker
#
# The Worker script alone has no public route: without a trigger the deployed
# script serves no traffic. The custom domain resource below attaches a
# public hostname to the Worker so the routes become reachable.
#
# The full hostname is BUILT here, not passed in whole: the environment
# provides only the base API hostname via `api_domain_hostname`
# (e.g. dev-api.example.com for DEV, api.example.com for PROD) and Terraform
# prefixes it with the service name to produce
# cloudflare-worker-template.dev-api.example.com /
# cloudflare-worker-template.api.example.com.
#
# Resource creation is conditional on `api_domain_hostname` being set, so a
# Worker-only deployment (hostname unset) still works.
# ---------------------------------------------------------------------------
locals {
  worker_hostname = var.api_domain_hostname != null ? "cloudflare-worker-template.${var.api_domain_hostname}" : null
}

resource "cloudflare_workers_custom_domain" "worker" {
  count = local.worker_hostname != null ? 1 : 0

  account_id = var.account_id
  hostname   = local.worker_hostname
  service    = cloudflare_workers_script.worker.script_name
  # The zone is resolved by ID (from the GitHub Environment vars — find it in
  # the Cloudflare dashboard: Domains → <zone> → API → Zone ID). The zone must
  # exist in the same Cloudflare account and contain the hostname.
  zone_id = var.zone_id
}

# ---------------------------------------------------------------------------
# Outputs — consumed by CI (GitHub Actions) for follow-up steps
# (e.g. running D1 migrations against the actual database).
# ---------------------------------------------------------------------------
output "d1_database_name" {
  value = cloudflare_d1_database.worker_db.name
}

output "d1_database_id" {
  value = cloudflare_d1_database.worker_db.id
}

output "worker_script_name" {
  value = cloudflare_workers_script.worker.script_name
}

# Named RPC entrypoints exposed by this Worker (see src/index.ts). Other
# services calling this service over a service binding MUST declare the
# matching `entrypoint` — otherwise the RPC call hits the HTTP fetch handler
# instead of the WorkerEntrypoint. Map keyed by capability.
output "entrypoint_names" {
  description = "Named RPC entrypoints exposed by the Worker, keyed by capability."
  value = {
    widget = "WidgetEntrypoint"
  }
}

output "custom_domain_hostname" {
  description = "Public hostname routed to the Worker (empty when no custom domain is configured)."
  value       = local.worker_hostname != null ? cloudflare_workers_custom_domain.worker[0].hostname : ""
}
