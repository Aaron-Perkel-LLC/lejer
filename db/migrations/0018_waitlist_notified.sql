-- The waitlist's launch note (lib/operator-mail.ts: the "waitlist" audience on /admin): when each
-- address was told, so the note goes out once and the page can say who has heard. NULL until then.
ALTER TABLE waitlist ADD COLUMN notified_at TIMESTAMPTZ NULL;
