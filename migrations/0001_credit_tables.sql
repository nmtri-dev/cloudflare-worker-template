CREATE TABLE IF NOT EXISTS credit_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  available_credits INTEGER NOT NULL DEFAULT 0,
  effective_from INTEGER,
  expired_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_credit_accounts_user_id ON credit_accounts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_account_unique ON credit_accounts(user_id, effective_from, expired_at) WHERE type = 'monthly';

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
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_id ON credit_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_account_id ON credit_ledger(credit_account_id);
