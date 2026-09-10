-- 015_drop_magic_links.sql
--
-- fresh_magic_links (created in 001) was written on every magic-link request
-- and read by nothing. The link a respondent receives carries a signed JWT and
-- an opaque resume token whose HMAC is the session id; the token filed in this
-- table was never placed in the link, and verifyMagicLink() -- the only reader
-- -- had no callers. What the table actually held was one row per request:
-- which hashed address asked for a link, and when. That is a log of respondent
-- activity the rest of the schema is careful not to keep, so it goes.
--
-- Nothing references it: no foreign key points here, and the only consumer
-- outside lib/auth.ts was one monitoring query, removed in the same change.

DROP TABLE IF EXISTS fresh_magic_links CASCADE;
