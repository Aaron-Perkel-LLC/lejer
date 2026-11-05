-- Per-member email preferences (ARCHITECTURE.md §6 "Unsubscribe"): the categories of household
-- mail a member has turned off, from an email's List-Unsubscribe link or the account page.
-- Values are lib/unsubscribe.ts MailCategory names ('reminders', 'notices', 'thanks', 'notes');
-- digest copies have no member, so turning them off clears households.digest_email instead.
-- Login codes, invites and deletion mail are transactional and never muted.

ALTER TABLE memberships ADD COLUMN muted_kinds TEXT[] NOT NULL DEFAULT '{}';
