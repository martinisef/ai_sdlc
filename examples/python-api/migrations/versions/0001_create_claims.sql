-- Applied in production. Never edit an applied migration: add a new one.
CREATE TABLE claims (
    id            BIGSERIAL PRIMARY KEY,
    policy_number TEXT        NOT NULL,
    amount_cents  BIGINT      NOT NULL CHECK (amount_cents > 0),
    description   TEXT        NOT NULL DEFAULT '',
    status        TEXT        NOT NULL DEFAULT 'submitted',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX claims_status_idx ON claims (status);
