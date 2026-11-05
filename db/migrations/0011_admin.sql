-- Operator admin (ARCHITECTURE.md §4 "Cross-household reads for the operator"). /admin reads
-- aggregates and household metadata through SECURITY DEFINER functions executable by lejer_app
-- alone, the email_sends_since / calendar_context pattern: never per-row tenant data (no
-- amounts, addresses, hashes or file paths), and never a new owner-connection call site.

-- One line per cron tick, stamped by lib/cron.ts: "sent 3, 1 failed", "skipped: nothing due",
-- "deferred: budget", "error: …".
ALTER TABLE households ADD COLUMN last_tick_outcome TEXT NULL;

-- Every household with its counts and cron bookkeeping.
CREATE FUNCTION admin_households()
  RETURNS TABLE (
    id int, name text, slug text, mode text, theme text, created_at timestamptz,
    member_count int, joined_count int, bill_count int, last_activity timestamptz,
    deletion_requested_at timestamptz, delete_after timestamptz, reminders_enabled boolean,
    last_run_at timestamptz, last_send_date date, last_sent_at timestamptz, last_sent_count int,
    last_tick_outcome text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT h.id, h.name, h.slug, h.mode, h.theme, h.created_at,
         (SELECT count(*)::int FROM memberships m WHERE m.household_id = h.id),
         (SELECT count(*)::int FROM memberships m WHERE m.household_id = h.id AND m.joined_at IS NOT NULL),
         (SELECT count(*)::int FROM bills b WHERE b.household_id = h.id),
         greatest(h.created_at,
                  (SELECT max(b.created_at) FROM bills b WHERE b.household_id = h.id),
                  (SELECT max(d.paid_at) FROM bill_debts d WHERE d.household_id = h.id),
                  (SELECT max(m.joined_at) FROM memberships m WHERE m.household_id = h.id)),
         h.deletion_requested_at, h.delete_after, h.reminders_enabled,
         h.last_run_at, h.last_send_date, h.last_sent_at, h.last_sent_count, h.last_tick_outcome
  FROM households h
  ORDER BY h.id
$$;

-- Account-wide totals.
CREATE FUNCTION admin_totals()
  RETURNS TABLE (
    households int, users int, memberships_joined int, memberships_pending int,
    bills int, bills_unpaid int, households_deleting int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT (SELECT count(*)::int FROM households),
         (SELECT count(*)::int FROM users),
         (SELECT count(*)::int FROM memberships WHERE joined_at IS NOT NULL),
         (SELECT count(*)::int FROM memberships WHERE joined_at IS NULL),
         (SELECT count(*)::int FROM bills),
         (SELECT count(*)::int FROM bills WHERE status = 'unpaid'),
         (SELECT count(*)::int FROM households WHERE delete_after IS NOT NULL OR deletion_requested_at IS NOT NULL)
$$;

-- Per ISO week (UTC), the last `weeks` weeks ending with this one, zero-filled.
CREATE FUNCTION admin_weekly(weeks int)
  RETURNS TABLE (week date, households int, users int, bills int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT w::date,
         (SELECT count(*)::int FROM households h WHERE date_trunc('week', h.created_at AT TIME ZONE 'UTC') = w),
         (SELECT count(*)::int FROM users u WHERE date_trunc('week', u.created_at AT TIME ZONE 'UTC') = w),
         (SELECT count(*)::int FROM bills b WHERE date_trunc('week', b.created_at AT TIME ZONE 'UTC') = w)
  FROM generate_series(
         date_trunc('week', now() AT TIME ZONE 'UTC') - make_interval(weeks => greatest(weeks, 1) - 1),
         date_trunc('week', now() AT TIME ZONE 'UTC'),
         interval '1 week') AS w
  ORDER BY w
$$;

-- Sends since a moment, per kind: how today's Resend budget was spent.
CREATE FUNCTION admin_email_kinds(since timestamptz)
  RETURNS TABLE (kind text, sent int, failed int)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.kind, count(*) FILTER (WHERE l.ok)::int, count(*) FILTER (WHERE NOT l.ok)::int
  FROM email_log l WHERE l.sent_at >= since
  GROUP BY l.kind ORDER BY l.kind
$$;

-- Recent failed sends: when, what kind, which household (by name; never the address or its hash).
CREATE FUNCTION admin_email_failures(since timestamptz, max_rows int)
  RETURNS TABLE (sent_at timestamptz, kind text, household_name text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT l.sent_at, l.kind, h.name
  FROM email_log l LEFT JOIN households h ON h.id = l.household_id
  WHERE l.sent_at >= since AND NOT l.ok
  ORDER BY l.sent_at DESC
  LIMIT greatest(max_rows, 0)
$$;

REVOKE EXECUTE ON FUNCTION admin_households() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_totals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_weekly(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_email_kinds(timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION admin_email_failures(timestamptz, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_households() TO lejer_app;
GRANT EXECUTE ON FUNCTION admin_totals() TO lejer_app;
GRANT EXECUTE ON FUNCTION admin_weekly(int) TO lejer_app;
GRANT EXECUTE ON FUNCTION admin_email_kinds(timestamptz) TO lejer_app;
GRANT EXECUTE ON FUNCTION admin_email_failures(timestamptz, int) TO lejer_app;
