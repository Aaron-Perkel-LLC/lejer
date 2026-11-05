-- Per-account email preferences (ARCHITECTURE.md §6 "Deliverability and unsubscribe"): the
-- categories of mail addressed to the person rather than to a member of some household that
-- they've turned off. The only value today is 'updates', the operator's notes about the
-- service from /admin (lib/operator-mail.ts), which carry a user-scoped unsubscribe link.
-- Mirrors memberships.muted_kinds (0014); users has no RLS.

ALTER TABLE users ADD COLUMN muted_kinds TEXT[] NOT NULL DEFAULT '{}';
