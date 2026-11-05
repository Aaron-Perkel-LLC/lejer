-- 0008: sheet is the default look for a new household (decided 2026-10-12). Only the column
-- default changes; existing rows keep their theme. createHousehold() always passes a theme, so
-- this is for the schema to agree with lib/theme.ts's DEFAULT_THEME.

ALTER TABLE households ALTER COLUMN theme SET DEFAULT 'sheet';
