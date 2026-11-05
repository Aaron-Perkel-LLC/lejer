-- The launch waitlist: addresses left on the coming-soon page (app/(site)/ComingSoon.tsx)
-- to be emailed once when Lejer opens. Global, like users and login_codes, so no RLS;
-- lejer_app gets its grants from 0001's default privileges. Nothing is sent on sign-up.

CREATE TABLE waitlist (
  email      CITEXT PRIMARY KEY,
  ip_hash    TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
