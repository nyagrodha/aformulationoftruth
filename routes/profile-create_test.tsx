import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

Deno.test('profile create ships its save script as a static file, not inline JSX', async () => {
  const page = await Deno.readTextFile(new URL('./profile-create.tsx', import.meta.url));
  assertStringIncludes(page, "src='/js/profile-create.js'");
  assertEquals(page.includes('<script>\n'), false);

  const script = await Deno.readTextFile(new URL('../public/js/profile-create.js', import.meta.url));
  assertStringIncludes(script, "fetch('/api/profile'");
  assertStringIncludes(script, 'event.preventDefault()');
  assertEquals(script.includes('&amp;'), false);
});
