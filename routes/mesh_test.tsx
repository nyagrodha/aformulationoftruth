import { assert, assertEquals, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import type { PageProps } from '$fresh/server.ts';
import MeshPage, { type MeshData } from './mesh.tsx';

function page(data: MeshData): string {
  return render(<MeshPage {...({ data } as unknown as PageProps<MeshData>)} />);
}

const ONE: MeshData = {
  questions: [{
    question_index: 12,
    text: 'What is your favorite occupation?',
    sent_at: new Date('2026-09-27T00:00:00Z'),
    answers: [
      { short_name: 'AURA', text: 'Weeding at dusk.', rx_at: new Date('2026-09-27T00:05:00Z') },
      { short_name: 'x<b>', text: '<script>alert(1)</script>', rx_at: new Date('2026-09-27T00:06:00Z') },
    ],
  }],
};

Deno.test('mesh page shows the question and its answers under short names', () => {
  const html = page(ONE);
  assertStringIncludes(html, 'What is your favorite occupation?');
  assertStringIncludes(html, 'AURA');
  assertStringIncludes(html, 'Weeding at dusk.');
});

Deno.test('answer text and names are escaped, never markup', () => {
  const html = page(ONE);
  assertEquals(html.includes('<script>alert(1)</script>'), false);
  // Preact escapes '<' (enough to stop any tag opening) and leaves '>' as-is.
  assertStringIncludes(html, '&lt;script>alert(1)&lt;/script>');
  assertEquals(html.includes('x<b>'), false);
});

Deno.test('the page never renders a node id', async () => {
  assertEquals(/![0-9a-f]{8}/.test(page(ONE)), false);
  const source = await Deno.readTextFile(new URL('./mesh.tsx', import.meta.url));
  assertEquals(source.includes('from_id'), false);
  assertEquals(source.includes('dangerouslySetInnerHTML'), false);
});

Deno.test('the footer says what is stored and how to be forgotten', () => {
  const html = page(ONE);
  assertStringIncludes(html, 'as reported by the radio');
  assertStringIncludes(html, 'forget');
  assertStringIncludes(html, 'A4T');
});

Deno.test('an empty wall says so', () => {
  assertStringIncludes(page({ questions: [] }), 'No question has gone out yet');
});

Deno.test('an unavailable wall still renders a page', () => {
  const html = page({ questions: [], unavailable: true });
  assertStringIncludes(html, "can't be read right now");
  assert(html.includes('Heard on the mesh'));
});
