-- 0006: a third theme, japandi (ARCHITECTURE.md §3, §7). households.theme is a CHECK, not an
-- enum, so adding a value is one ALTER: drop the constraint 0001 created inline (Postgres named
-- it households_theme_check) and re-add it with the new value. Existing rows are untouched.

ALTER TABLE households DROP CONSTRAINT households_theme_check;
ALTER TABLE households
  ADD CONSTRAINT households_theme_check CHECK (theme IN ('statement', 'peach', 'japandi'));
