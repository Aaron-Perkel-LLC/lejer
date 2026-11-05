-- 0009: deleting a household, and leaving one (ARCHITECTURE.md §5 "Deleting a household and
-- leaving", decided 2026-10-12).
--
-- A household with one joined member is marked for deletion when that member types its name.
-- Otherwise an admin requests it, every joined member has to approve (pending invites don't
-- vote), one cancel ends it, and the request lapses after 14 days. Marked households are
-- read-only for 7 days, any admin can undo, then the cron deletes the Blob prefix and the row
-- (everything cascades). A household is never requested and marked at once.

ALTER TABLE households
  ADD COLUMN deletion_requested_at TIMESTAMPTZ NULL,
  ADD COLUMN deletion_requested_by INTEGER     NULL,
  ADD COLUMN delete_after          TIMESTAMPTZ NULL,  -- marked: read-only, hard-deleted once past
  ADD CONSTRAINT households_deletion_requested_by_fk FOREIGN KEY (deletion_requested_by, id)
    REFERENCES memberships (id, household_id) ON DELETE SET NULL (deletion_requested_by),
  ADD CONSTRAINT households_deletion_one_state CHECK (deletion_requested_at IS NULL OR delete_after IS NULL);

-- One row per joined member who approved the open request (the requester included). Cleared
-- with the request; a member who leaves takes their approval with them.
CREATE TABLE deletion_approvals (
  household_id  INTEGER     NOT NULL REFERENCES households ON DELETE CASCADE,
  membership_id INTEGER     NOT NULL,
  approved_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (household_id, membership_id),
  FOREIGN KEY (membership_id, household_id) REFERENCES memberships (id, household_id) ON DELETE CASCADE
);

ALTER TABLE deletion_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant ON deletion_approvals
  USING (household_id = app_household_id()) WITH CHECK (household_id = app_household_id());

-- email_log feeds the account-wide Resend budget (email_sends_since). Deleting a household must
-- not erase today's sends from that count, so its rows outlive it with no household.
ALTER TABLE email_log DROP CONSTRAINT email_log_household_id_fkey;
ALTER TABLE email_log ADD CONSTRAINT email_log_household_id_fkey
  FOREIGN KEY (household_id) REFERENCES households ON DELETE SET NULL;
