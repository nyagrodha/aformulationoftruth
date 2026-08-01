import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import RespondentsPage from './respondents.tsx';

Deno.test('page covers Pivot as the modern transmitter of the form', () => {
  assertStringIncludes(render(<RespondentsPage />), 'Pivot');
});

Deno.test('page covers the Vanity Fair back page', () => {
  assertStringIncludes(render(<RespondentsPage />), 'Vanity Fair');
});

Deno.test('page links back to about', () => {
  assertStringIncludes(render(<RespondentsPage />), 'href="/about"');
});
