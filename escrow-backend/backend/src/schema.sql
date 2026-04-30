-- ============================================================
--  Freelance Escrow dApp — PostgreSQL Schema
--  Run: psql $DATABASE_URL -f src/schema.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────────────────────────
--  USERS
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_address VARCHAR(42) UNIQUE NOT NULL,          -- 0x + 40 hex chars
    username      VARCHAR(50) UNIQUE,
    email         VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),                           -- null for wallet-only users
    role          VARCHAR(20)  NOT NULL DEFAULT 'user'   -- 'user' | 'admin'
                  CHECK (role IN ('user', 'admin')),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);

-- ─────────────────────────────────────────────────────────────
--  OFF-CHAIN ESCROW METADATA
--  Mirrors on-chain data + stores metadata that can't live on-chain
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS off_chain_escrows (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    chain_escrow_id  INTEGER      NOT NULL,               -- on-chain escrow ID
    chain_id         INTEGER      NOT NULL DEFAULT 300,   -- 300 = zkSync Sepolia
    tx_hash          VARCHAR(66)  NOT NULL UNIQUE,        -- deployment tx
    contract_address VARCHAR(42)  NOT NULL,

    -- Parties (mirrors on-chain, stored for fast queries)
    client_address      VARCHAR(42) NOT NULL,
    freelancer_address  VARCHAR(42) NOT NULL,
    arbiter_address     VARCHAR(42) NOT NULL,

    -- Financial
    amount_wei   NUMERIC(78, 0) NOT NULL,                 -- exact wei, no floats
    deadline_ts  TIMESTAMPTZ    NOT NULL,

    -- Status mirrors on-chain enum: Active|Released|Cancelled|Disputed
    status       VARCHAR(20) NOT NULL DEFAULT 'Active'
                 CHECK (status IN ('Active','Released','Cancelled','Disputed')),

    -- Off-chain metadata
    title        VARCHAR(255),
    description  TEXT,
    tags         TEXT[],

    -- Timestamps
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_chain_escrow UNIQUE (chain_id, chain_escrow_id)
);

CREATE INDEX IF NOT EXISTS idx_escrows_client     ON off_chain_escrows(client_address);
CREATE INDEX IF NOT EXISTS idx_escrows_freelancer ON off_chain_escrows(freelancer_address);
CREATE INDEX IF NOT EXISTS idx_escrows_status     ON off_chain_escrows(status);
CREATE INDEX IF NOT EXISTS idx_escrows_chain_id   ON off_chain_escrows(chain_id, chain_escrow_id);

-- ─────────────────────────────────────────────────────────────
--  DISPUTE EVIDENCE
--  Files / URLs / text submitted during dispute
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispute_evidence (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_id     UUID        NOT NULL REFERENCES off_chain_escrows(id) ON DELETE CASCADE,
    submitted_by  VARCHAR(42) NOT NULL,                   -- wallet address
    evidence_type VARCHAR(20) NOT NULL DEFAULT 'text'
                  CHECK (evidence_type IN ('text','url','ipfs_hash')),
    content       TEXT        NOT NULL,
    description   VARCHAR(500),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_escrow ON dispute_evidence(escrow_id);

-- ─────────────────────────────────────────────────────────────
--  ADMIN LOGS
--  Audit trail for all admin actions
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_logs (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id    UUID        NOT NULL REFERENCES users(id),
    action      VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),                              -- 'user' | 'escrow' | 'system'
    target_id   VARCHAR(255),                             -- UUID or wallet address
    metadata    JSONB,                                    -- any extra data
    ip_address  VARCHAR(45),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_admin  ON admin_logs(admin_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_time   ON admin_logs(created_at DESC);

-- ─────────────────────────────────────────────────────────────
--  REFRESH TOKENS
--  For secure JWT rotation
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

-- ─────────────────────────────────────────────────────────────
--  TRIGGER: auto-update updated_at
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_escrows_updated_at
    BEFORE UPDATE ON off_chain_escrows
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
