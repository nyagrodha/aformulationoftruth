-- 020: a private profile's own address.
--
-- /p/<handle> now serves public profiles only; a private one answers 404 there,
-- exactly like a handle nobody holds, so handles cannot be probed for private
-- profiles. A private profile is reachable instead at /p/~<private_slug>, a link
-- its owner can hand out and replace.
--
-- The slug is RANDOM, not derived from anything. In particular it is not a hash
-- of email_hash: email_hash is an unsalted SHA-256 of the normalised address, so
-- anything computed from it can be recomputed by whoever knows the address. That
-- would make the "private" link enumerable from a list of addresses, permanent
-- (it could never be rotated), and a value an address is recoverable from --
-- which /var/www/CLAUDE.md forbids.
--
-- gen_random_uuid() is volatile, so ADD COLUMN evaluates it per row: existing
-- profiles each get their own slug. 122 random bits, stored as 32 hex chars;
-- the app rotates slugs with crypto.getRandomValues in the same format.
--
-- Apply by hand as admin (a4m_app is DML-only) BEFORE deploying the code that
-- reads this column: lib/profiles.ts selects it, so /people and /p/* fail until
-- it exists. /api/health reports the column as missing until then.

ALTER TABLE fresh_profiles
  ADD COLUMN IF NOT EXISTS private_slug VARCHAR(32) NOT NULL
    DEFAULT replace(gen_random_uuid()::text, '-', '');

CREATE UNIQUE INDEX IF NOT EXISTS idx_fresh_profiles_private_slug
  ON fresh_profiles (private_slug);

-- Only a public profile holds a handle (lib/profiles.ts validateProfile). A
-- private row keeping one would make the UNIQUE constraint an oracle: trying to
-- claim that handle would answer "taken" and reveal the private profile.
--
-- The cleanup alone is not enough: this file is applied BEFORE the code that
-- clears handles is deployed, so the old /api/profile could write a private
-- row with a handle in between. The CHECK makes the database refuse that,
-- whichever code is running.
UPDATE fresh_profiles SET handle = NULL WHERE visibility = 'private' AND handle IS NOT NULL;

ALTER TABLE fresh_profiles DROP CONSTRAINT IF EXISTS fresh_profiles_private_has_no_handle;
ALTER TABLE fresh_profiles ADD CONSTRAINT fresh_profiles_private_has_no_handle
  CHECK (visibility = 'public' OR handle IS NULL);
