import { assertEquals } from '$std/assert/mod.ts';
import {
  emptyToNull,
  formVisibilityToSchema,
  HANDLE_RE,
  profileHandleError,
  profileLabel,
  RESERVED_HANDLES,
} from './profiles.ts';

Deno.test('a public profile without a handle is refused', () => {
  assertEquals(profileHandleError(null, 'public'), 'A public profile needs a handle.');
  assertEquals(profileHandleError('', 'public'), 'A public profile needs a handle.');
});

Deno.test('a private profile may omit a handle', () => {
  assertEquals(profileHandleError(null, 'private'), null);
});

Deno.test('reserved and malformed handles are refused', () => {
  assertEquals(profileHandleError('about', 'public'), 'That handle is not available.');
  assertEquals(profileHandleError('people', 'private'), 'That handle is not available.');
  assertEquals(profileHandleError('messenger', 'public'), 'That handle is not available.');
  assertEquals(profileHandleError('-leading', 'public'), 'That handle is not available.');
  assertEquals(profileHandleError('trailing-', 'public'), 'That handle is not available.');
  assertEquals(profileHandleError('Has Caps', 'public'), 'That handle is not available.');
  assertEquals(profileHandleError('ok', 'public'), null);
  assertEquals(profileHandleError('weather-report', 'public'), null);
});

Deno.test('HANDLE_RE matches the published /p/<handle> shape', () => {
  assertEquals(HANDLE_RE.test('ab'), true);
  assertEquals(HANDLE_RE.test('a'), false);
});

Deno.test('reserved handles include the live routes a handle would shadow', () => {
  for (const name of ['people', 'p', 'profile-create', 'shop', 'gate', 'questions']) {
    assertEquals(RESERVED_HANDLES.has(name), true);
  }
});

Deno.test('form radios map onto the stored visibility pair', () => {
  assertEquals(formVisibilityToSchema('selected'), {
    visibility: 'public',
    acceptsAnonymousMail: false,
  });
  assertEquals(formVisibilityToSchema('anonymous-mail'), {
    visibility: 'private',
    acceptsAnonymousMail: true,
  });
  assertEquals(formVisibilityToSchema('private'), {
    visibility: 'private',
    acceptsAnonymousMail: false,
  });
});

Deno.test('empty strings become null so the row stays sparse', () => {
  assertEquals(emptyToNull(''), null);
  assertEquals(emptyToNull('  '), null);
  assertEquals(emptyToNull('name'), 'name');
});

Deno.test('profileLabel never falls back to an email hash', () => {
  assertEquals(profileLabel(null), 'someone');
  assertEquals(
    profileLabel({
      emailHash: 'deadbeef',
      handle: 'weather',
      displayName: null,
      bio: null,
      visibility: 'public',
      acceptsMail: false,
      createdAt: new Date(),
    }),
    'weather',
  );
});
