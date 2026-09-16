import { assertEquals, assertStringIncludes } from '$std/assert/mod.ts';

Deno.test('profile create ships its save script as a static file, not inline JSX', async () => {
  const page = await Deno.readTextFile(new URL('./profile-create.tsx', import.meta.url));
  assertStringIncludes(page, "src='/js/profile-create.js'");
  assertEquals(page.includes('<script>\n'), false);
  assertStringIncludes(page, 'ProfileFieldsSchema');
  assertStringIncludes(page, 'profileAfterSavePath');
  assertStringIncludes(page, 'status: result.status');
  assertEquals(page.includes('Nothing appears publicly until you choose the answers'), false);
  assertEquals(page.includes('take me to a per-answer review screen'), false);

  const script = await Deno.readTextFile(new URL('../public/js/profile-create.js', import.meta.url));
  assertStringIncludes(script, "fetch('/api/profile'");
  assertStringIncludes(script, 'event.preventDefault()');
  assertStringIncludes(script, "data.visibility === 'public'");
  assertEquals(script.includes('&amp;'), false);
});

Deno.test('profile choice does not claim per-answer publishing', async () => {
  const page = await Deno.readTextFile(new URL('./profile-choice.tsx', import.meta.url));
  assertEquals(page.includes('per-answer visibility'), false);
  assertEquals(page.includes('unpublish answers'), false);
  assertEquals(page.includes('render public some or all answers'), false);
});
