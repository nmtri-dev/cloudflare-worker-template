variable "cloudflare_api_token" {
  type        = string
  description = "Cloudflare API token. Leave unset to use the CLOUDFLARE_API_TOKEN environment variable."
  sensitive   = true
  default     = null
}

variable "account_id" {
  type        = string
  description = "Cloudflare account ID (also available as the CF_ACCOUNT_ID org var)."
}

variable "environment" {
  type        = string
  description = "Environment name. 'dev' or 'production' (determines worker/D1 names)."
  validation {
    condition     = contains(["dev", "production"], var.environment)
    error_message = "environment must be one of: dev, production."
  }
}

variable "allowed_origins" {
  type        = string
  description = "Comma-separated CORS allowed origins (ALLOWED_ORIGINS binding)."
  default     = ""
}

variable "jwt_public_key" {
  type        = string
  description = "RSA public key PEM used to verify JWTs (JWT_PUBLIC_KEY binding)."
}

variable "rate_limit_namespace_id" {
  type        = string
  description = "Namespace ID for the RATE_LIMITER rate limiting binding — a positive integer string unique to the Cloudflare account (e.g. \"1001\"). Use a distinct value per environment so dev and prod counters do not share state. Sourced from the GitHub Environment vars (RATE_LIMIT_NAMESPACE_ID)."
}

variable "rate_limit_limit" {
  type        = number
  description = "Rate limit budget for the RATE_LIMITER binding — the number of allowed requests (calls to `limit()`) within each 60 s window per principal. Sourced from the GitHub Environment vars (RATE_LIMIT_LIMIT); defaults to 1000."
  default     = 1000
}

variable "api_domain_hostname" {
  type        = string
  description = "Base API hostname for the environment, e.g. dev-api.example.com (dev) or api.example.com (production). Terraform prefixes it with the service name to build the Worker's public hostname (e.g. cloudflare-worker-template.dev-api.example.com). Leave unset (null) to deploy the Worker without a public hostname."
  default     = null
}

variable "zone_id" {
  type        = string
  description = "Cloudflare zone ID containing the API domain hostname (e.g. example.com zone). Only used when api_domain_hostname is set."
  default     = null
}

# ---------------------------------------------------------------------------
# Remote state (cross-service discovery)
#
# The worker reads the access-management service's state from the same R2
# state bucket via `terraform_remote_state` (see main.tf) to resolve the
# ACCESS_MGMT worker name. These variables duplicate the backend configuration
# used in backend.tf/CI so the data source can access the bucket. They are
# injected per environment in CI (same values as the -backend-config args).
# ---------------------------------------------------------------------------
variable "tfstate_r2_bucket" {
  type        = string
  description = "R2 bucket holding Terraform state (TFSTATE_R2_BUCKET secret). Also used to seed empty states for other services via the CI init-state workflow."
}

variable "tfstate_r2_access_key" {
  type        = string
  description = "R2 access key for the state bucket (R2_ACCESS_KEY_ID secret)."
  sensitive   = true
}

variable "tfstate_r2_secret_key" {
  type        = string
  description = "R2 secret key for the state bucket (R2_SECRET_ACCESS_KEY secret)."
  sensitive   = true
}
