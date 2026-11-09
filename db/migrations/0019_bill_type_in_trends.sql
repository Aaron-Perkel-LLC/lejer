-- 0019: a utility can be left off Trends (decided 2026-11-09). Some bills are flat and say
-- nothing month to month (internet, a phone plan, insurance), so an admin unticks "Show on
-- Trends" on the utility and its series, totals row and CSV column go away; its bills stay
-- everywhere else. Every existing utility stays on.

ALTER TABLE bill_types ADD COLUMN in_trends BOOLEAN NOT NULL DEFAULT true;
