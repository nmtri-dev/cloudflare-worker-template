# Terraform state backend — Cloudflare R2 (S3-compatible).
#
# All backend configuration (bucket, endpoint, R2 API token, and the
# per-environment state KEY) is injected via `-backend-config` from CI, so no
# secrets live in this repo and a single folder serves both environments.
#
# The state key differs per environment and is passed at init time:
#   DEV:  terraform init -backend-config="key=cloudflare-worker-template/dev.tfstate" ...
#   PROD: terraform init -backend-config="key=cloudflare-worker-template/production.tfstate" ...
#
# Because Terraform only ever runs in GitHub Actions on clean runners (a fresh
# `terraform init` per run), there is no risk of cross-environment state
# mixing — each run's state is fixed by the key at init.
#
# CI invocation (see .github/workflows/terraform.yml and deploy-dev.yml):
#   terraform init \
#     -backend-config="bucket=$TFSTATE_R2_BUCKET" \
#     -backend-config="key=cloudflare-worker-template/<env>.tfstate" \
#     -backend-config="endpoints={s3=\"https://$CF_ACCOUNT_ID.r2.cloudflarestorage.com\"}" \
#     -backend-config="access_key=$R2_ACCESS_KEY_ID" \
#     -backend-config="secret_key=$R2_SECRET_ACCESS_KEY"
#
# Note: R2 supports the S3 conditional requests (If-Match) that the S3 backend
# uses for state locking. If a lock is ever stale, run:
#   terraform force-unlock <lockID>

terraform {
  backend "s3" {
    # `bucket`, `key`, `endpoints`, `access_key`, `secret_key` are injected
    # via -backend-config per environment (they hold secrets / per-env values).

    # `region` is required by the S3 backend; "auto" is the R2 convention.
    region = "auto"

    # R2 (S3-compatible) skips: no IAM credential validation, no region
    # validation, no account lookup, no metadata API, no S3 checksums.
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
  }
}
