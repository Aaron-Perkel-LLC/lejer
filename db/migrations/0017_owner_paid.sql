-- The payer's own check-off (ARCHITECTURE.md §3 "The payer's own check-off"): with
-- feature_owner_checkoff on, the person who fronts a bill ticks it off once they've paid the
-- provider; until then the bill stays unpaid and they get the reminders. bills.owner_paid_at is
-- that tick (NULL = not yet). It is not a debt row: the ledger between people is unchanged.
-- Existing bills are backfilled as settled (the past is paid); with the setting off, new bills
-- are posted settled too, so turning it on later never reopens old bills.
-- Off by default; createHousehold() turns it on for a new single-payer household.

ALTER TABLE households ADD COLUMN feature_owner_checkoff BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE bills ADD COLUMN owner_paid_at TIMESTAMPTZ NULL;
UPDATE bills SET owner_paid_at = created_at;
CREATE INDEX bills_owner_open ON bills (household_id) WHERE owner_paid_at IS NULL;
