-- 0007: a fourth theme, sheet (the public site's drafting sheet as a household theme). Same
-- one-ALTER pattern as 0006. Existing rows are untouched.

ALTER TABLE households DROP CONSTRAINT households_theme_check;
ALTER TABLE households
  ADD CONSTRAINT households_theme_check CHECK (theme IN ('statement', 'peach', 'japandi', 'sheet'));
