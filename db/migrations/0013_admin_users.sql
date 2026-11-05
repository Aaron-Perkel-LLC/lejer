-- The operator's users list (ARCHITECTURE.md §4 "Cross-household reads for the operator"): one row
-- per user with their memberships as json, read by /admin through the same hardened definer
-- pattern as 0011. Addresses are shown to the operator (decided 2026-10-13); amounts, statement
-- paths, hashes and tokens still never leave a definer function.

CREATE FUNCTION admin_users()
  RETURNS TABLE (id int, email text, name text, created_at timestamptz, memberships json)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.email::text, u.name, u.created_at,
         coalesce((
           SELECT json_agg(json_build_object(
                    'membershipId', m.id, 'householdId', h.id, 'householdName', h.name, 'slug', h.slug,
                    'role', m.role, 'joinedAt', m.joined_at)
                  ORDER BY h.name)
           FROM memberships m JOIN households h ON h.id = m.household_id
           WHERE m.user_id = u.id), '[]'::json)
  FROM users u
  ORDER BY u.created_at DESC, u.id DESC
$$;

REVOKE EXECUTE ON FUNCTION admin_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION admin_users() TO lejer_app;
