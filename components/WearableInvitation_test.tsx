import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import WearableInvitation from './WearableInvitation.tsx';

const BASE = { displayName: null, shareOwnerResponses: false, greeting: 'Hey' };

Deno.test('renders the greeting line', () => {
  const html = render(<WearableInvitation {...BASE} />);
  assertStringIncludes(html, 'Hey,');
});

Deno.test("contains every paragraph's distinctive phrase", () => {
  const html = render(<WearableInvitation {...BASE} />);
  assertStringIncludes(html, 'landed you');
  assertStringIncludes(html, '35 introspective questions');
  assertStringIncludes(html, 'maildrop.cc');
  assertStringIncludes(html, 'anonymous encounter');
  assertStringIncludes(html, 'there are no others');
  assertStringIncludes(html, 'Love!');
});

Deno.test('contains the three links and the begin button', () => {
  const html = render(<WearableInvitation {...BASE} />);
  assertStringIncludes(html, 'https://cock.li');
  assertStringIncludes(html, 'https://maildrop.cc');
  assertStringIncludes(html, '/privacy');
  assertStringIncludes(html, "href='/' class='gate-submit'>begin</a>".replace(/'/g, '"'));
});

/* Task 5h: drawn in the landing's look, not main.css's dark one. */
Deno.test("renders on the landing's stylesheet, nav and footer", () => {
  const html = render(<WearableInvitation {...BASE} />);
  assertStringIncludes(html, '/css/prolegomenon.css');
  assertStringIncludes(html, '/css/nav-mark.css');
  assertStringIncludes(html, 'class="site-header"');
  assertStringIncludes(html, 'class="gate-title"');
  // SiteFooter's own lines, which no other footer carries.
  assertStringIncludes(html, 'FlokiNET');
  assertStringIncludes(html, 'Onion mirror');
  if (html.includes('/css/main.css')) throw new Error('main.css must no longer be loaded');
});

Deno.test('shareOwnerResponses: true includes the reciprocity paragraph', () => {
  const html = render(<WearableInvitation {...BASE} shareOwnerResponses />);
  assertStringIncludes(html, 'Its bearer has chosen reciprocity');
});

Deno.test('shareOwnerResponses: false omits the reciprocity paragraph', () => {
  const html = render(<WearableInvitation {...BASE} shareOwnerResponses={false} />);
  const hasReciprocity = html.includes('Its bearer has chosen reciprocity');
  if (hasReciprocity) {
    throw new Error('reciprocity paragraph should not render when shareOwnerResponses is false');
  }
});

Deno.test('displayName is never shown, even when present', () => {
  const html = render(<WearableInvitation {...BASE} displayName='Cameron' />);
  if (html.includes('Cameron')) {
    throw new Error('displayName must not be rendered by the new copy');
  }
});

/* The owner's illuminated initials: an H each for Hi and Hola, an N for Namaste; nothing for the rest. */
Deno.test('all five greetings open on their own illuminated initial; the text still reads whole', () => {
  for (
    const [greeting, img, rest] of [
      ['Hi', '/images/h-illuminated-hi-400.webp', 'i'],
      ['Hola', '/images/h-illuminated-hola-400.webp', 'ola'],
      ['Namaste', '/images/n-illuminated-namaste-400.webp', 'amaste'],
      ['Vanakkam', '/images/v-illuminated-vanakkam-400.webp', 'anakkam'],
      ['Bonjour', '/images/b-illuminated-bonjour-400.webp', 'onjour'],
    ]
  ) {
    const html = render(<WearableInvitation {...BASE} greeting={greeting} />);
    assertStringIncludes(html, `src="${img}"`);
    assertStringIncludes(html, `<span class="sr-only">${greeting[0]}</span>${rest}`);
  }
});

Deno.test('other greetings stay plain text, with no illuminated initial', () => {
  for (const greeting of ['Hey', 'constructor']) {
    const html = render(<WearableInvitation {...BASE} greeting={greeting} />);
    if (html.includes('greeting-initial')) throw new Error(`${greeting} must not get an initial`);
    assertStringIncludes(html, `${greeting},`);
  }
});

Deno.test('only Bonjour gets the French no-parking sign', () => {
  const fr = render(<WearableInvitation {...BASE} greeting='Bonjour' />);
  assertStringIncludes(fr, 'class="no-parking-sign"');
  assertStringIncludes(fr, 'aria-label="Prière de ne pas stationner devant cette porte"');
  for (const greeting of ['Hi', 'Hola', 'Vanakkam', 'Namaste']) {
    const html = render(<WearableInvitation {...BASE} greeting={greeting} />);
    if (html.includes('no-parking-sign')) throw new Error(`${greeting} must not get the sign`);
  }
});
