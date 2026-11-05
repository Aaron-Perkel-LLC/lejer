-- 0012: a utility's emoji is optional (decided 2026-10-13). NULL means none, and the check keeps
-- it the only spelling of none, so every place that shows a utility tests one thing. Existing
-- rows all have one; a blank one, if any slipped in, becomes NULL first.

ALTER TABLE bill_types ALTER COLUMN emoji DROP NOT NULL;
UPDATE bill_types SET emoji = NULL WHERE btrim(emoji) = '';
ALTER TABLE bill_types ADD CONSTRAINT bill_types_emoji_not_blank CHECK (btrim(emoji) <> '');
