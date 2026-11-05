-- 0010: the welcome tour is on for a new household (decided 2026-10-13), so whoever creates one
-- is offered it on their first overview (createHousehold() leaves the creator's welcomed_at
-- NULL), as is everyone they invite. Only the column default changes; existing households keep
-- whatever they chose.

ALTER TABLE households ALTER COLUMN feature_welcome_tour SET DEFAULT true;
