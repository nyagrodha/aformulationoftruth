/**
 * Tests for routes/index.tsx (the "Prolegomenon" landing page)
 *
 * Covers:
 *  - the GET handler, which simply delegates to ctx.render()
 *  - the structure of the `Home` component's rendered vnode tree
 *
 * `Home` is called directly (not rendered to the DOM/HTML) because it is a
 * plain functional component with no hooks; calling it just builds the
 * Preact vnode tree, which is enough to make structural assertions without
 * needing a DOM or an HTML renderer.
 *
 * Run with: deno task test
 */

import { assert, assertEquals, assertExists, assertStringIncludes } from '$std/assert/mod.ts';
import Home, { handler } from '../routes/index.tsx';
import QuaternarySpheroid from '../islands/QuaternarySpheroid.tsx';

// ============================================================================
// vnode traversal helpers
// ============================================================================

// deno-lint-ignore no-explicit-any
type AnyVNode = { type: unknown; props: Record<string, any> };

// deno-lint-ignore no-explicit-any
function isVNode(node: any): node is AnyVNode {
  return typeof node === 'object' && node !== null && 'type' in node && 'props' in node;
}

// deno-lint-ignore no-explicit-any
function childrenOf(node: any): any[] {
  if (!isVNode(node)) return [];
  const children = node.props?.children;
  if (children === undefined || children === null) return [];
  return Array.isArray(children) ? children : [children];
}

function findAll(
  root: unknown,
  predicate: (node: AnyVNode) => boolean,
  acc: AnyVNode[] = [],
): AnyVNode[] {
  if (Array.isArray(root)) {
    for (const child of root) findAll(child, predicate, acc);
    return acc;
  }
  if (!isVNode(root)) return acc;
  if (predicate(root)) acc.push(root);
  for (const child of childrenOf(root)) findAll(child, predicate, acc);
  return acc;
}

function findFirst(root: unknown, predicate: (node: AnyVNode) => boolean): AnyVNode | undefined {
  return findAll(root, predicate)[0];
}

function textOf(root: unknown): string {
  if (root === null || root === undefined || typeof root === 'boolean') return '';
  if (typeof root === 'string' || typeof root === 'number') return String(root);
  if (Array.isArray(root)) return root.map(textOf).join('');
  if (isVNode(root)) return childrenOf(root).map(textOf).join('');
  return '';
}

function byTag(tag: string) {
  return (node: AnyVNode) => node.type === tag;
}

function hasClass(node: AnyVNode, cls: string): boolean {
  const classAttr = node.props?.class;
  return typeof classAttr === 'string' && classAttr.split(/\s+/).includes(cls);
}

function findByTagAndClass(root: unknown, tag: string, cls: string): AnyVNode | undefined {
  return findFirst(root, (node) => node.type === tag && hasClass(node, cls));
}

function findAllByTagAndClass(root: unknown, tag: string, cls: string): AnyVNode[] {
  return findAll(root, (node) => node.type === tag && hasClass(node, cls));
}

// ============================================================================
// Test Suite: GET handler
// ============================================================================

Deno.test({
  name: 'index: GET handler delegates to ctx.render() and returns its result',
  async fn() {
    let renderCalls = 0;
    const sentinel = new Response('sentinel-body');
    const ctx = {
      render: () => {
        renderCalls++;
        return sentinel;
      },
      // deno-lint-ignore no-explicit-any
    } as any;

    const result = await handler.GET!(new Request('http://localhost/'), ctx);

    assertEquals(renderCalls, 1);
    assertEquals(result, sentinel);
  },
});

// ============================================================================
// Test Suite: Home component - document head
// ============================================================================

Deno.test({
  name: 'Home - renders an <html lang="en"> root with the expected <head> metadata',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    assertEquals(tree.type, 'html');
    assertEquals(tree.props.lang, 'en');

    const title = findFirst(tree, byTag('title'));
    assertExists(title);
    assertEquals(textOf(title), 'Prolegomenon | a4முளसत्यsya');
  },
});

Deno.test({
  name: 'Home - <head> declares the description meta tag and the prolegomenon stylesheet',
  fn() {
    const tree = Home() as unknown as AnyVNode;

    const description = findFirst(
      tree,
      (node) => node.type === 'meta' && node.props.name === 'description',
    );
    assertExists(description);
    assertEquals(
      description!.props.content,
      'Some thoughts prior to the main sequence, a Proust questionnaire.',
    );

    const stylesheet = findFirst(
      tree,
      (node) => node.type === 'link' && node.props.rel === 'stylesheet',
    );
    assertExists(stylesheet);
    assertEquals(stylesheet!.props.href, '/css/prolegomenon.css');
  },
});

// ============================================================================
// Test Suite: Home component - header & navigation
// ============================================================================

Deno.test({
  name: 'Home - site header wordmark links to #top and spells out the wordmark text',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const header = findByTagAndClass(tree, 'header', 'site-header');
    assertExists(header);

    const wordmark = findFirst(header, (node) => node.type === 'a' && hasClass(node, 'wordmark'));
    assertExists(wordmark);
    assertEquals(wordmark!.props.href, '#top');
    assertEquals(wordmark!.props['aria-label'], 'A formulation of truth');
  },
});

Deno.test({
  name: 'Home - primary navigation links to the text, sequence, and questions sections',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const nav = findFirst(
      tree,
      (node) => node.type === 'nav' && node.props['aria-label'] === 'Primary navigation',
    );
    assertExists(nav);

    const links = findAll(nav, byTag('a'));
    assertEquals(links.length, 3);
    assertEquals(links.map((link) => link.props.href), ['#prolegomenon', '#sequence', '/questions']);
    assertEquals(links.map((link) => textOf(link)), ['Text', 'Sequence', 'Questions']);
  },
});

// ============================================================================
// Test Suite: Home component - hero section
// ============================================================================

Deno.test({
  name: 'Home - hero section is labelled and anchors the #top / #prolegomenon landmarks',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const hero = findByTagAndClass(tree, 'section', 'hero');
    assertExists(hero);
    assertEquals(hero!.props.id, 'top');
    assertEquals(hero!.props['aria-labelledby'], 'prolegomenon');
  },
});

Deno.test({
  name: 'Home - hero title and eyebrow render the expected copy',
  fn() {
    const tree = Home() as unknown as AnyVNode;

    const heroTitle = findByTagAndClass(tree, 'p', 'hero-title');
    assertExists(heroTitle);
    assertEquals(textOf(heroTitle), 'Some thoughts prior to the main sequence, a Proust questionnaire.');

    const eyebrow = findFirst(
      tree,
      (node) => node.type === 'p' && hasClass(node, 'eyebrow') && node.props.id === 'prolegomenon',
    );
    assertExists(eyebrow);
    assertEquals(textOf(eyebrow), 'PROLEGOMENON:');
  },
});

Deno.test({
  name: 'Home - hero datestamp renders the mathematical dimension callout',
  fn() {
    const tree = Home() as unknown as AnyVNode;

    const mathematical = findByTagAndClass(tree, 'span', 'mathematical');
    assertExists(mathematical);
    assertEquals(textOf(mathematical), '4y-dimensional');

    const datestamp = findByTagAndClass(tree, 'p', 'hero-datestamp');
    assertExists(datestamp);
    assertStringIncludes(textOf(datestamp), 'Inscribed in the');
    assertStringIncludes(
      textOf(datestamp),
      'in the reign of Pope Leo XIV.',
    );
  },
});

Deno.test({
  name: 'Home - incipit paragraph uses an accessible drop-cap pattern',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const incipit = findByTagAndClass(tree, 'p', 'incipit');
    assertExists(incipit);

    const dropCap = findByTagAndClass(incipit, 'span', 'drop-cap');
    assertExists(dropCap);
    assertEquals(textOf(dropCap), 'T');
    assertEquals(dropCap!.props['aria-hidden'], 'true');

    const srOnly = findByTagAndClass(incipit, 'span', 'sr-only');
    assertExists(srOnly);
    assertEquals(textOf(srOnly), 'T');

    assertStringIncludes(
      textOf(incipit),
      'he site serves a sequence of prompts. Call them questions, or invitations to pause.',
    );
  },
});

Deno.test({
  name: 'Home - "continue reading" affordance links into the sequence',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const enter = findByTagAndClass(tree, 'a', 'enter');
    assertExists(enter);
    assertEquals(enter!.props.href, '#sequence');
    assertStringIncludes(textOf(enter), 'continue reading');
  },
});

Deno.test({
  name: 'Home - hero section renders the QuaternarySpheroid island alongside the Geometry figure',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const hero = findByTagAndClass(tree, 'section', 'hero');
    assertExists(hero);

    const spheroidNode = findFirst(hero, (node) => node.type === QuaternarySpheroid);
    assertExists(spheroidNode);

    // The hero section renders two component (non-string-tag) children: the
    // unexported `Geometry` figure and the `QuaternarySpheroid` island.
    const componentChildren = childrenOf(hero).filter(
      (child) => isVNode(child) && typeof child.type === 'function',
    );
    assertEquals(componentChildren.length, 2);
  },
});

Deno.test({
  name: 'Home - hero folio aside displays the page index (01) and total movement count',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const folio = findByTagAndClass(tree, 'aside', 'folio');
    assertExists(folio);

    const movementSections = findAllByTagAndClass(tree, 'section', 'movement');
    const expectedTotal = String(movementSections.length).padStart(2, '0');

    const folioText = textOf(folio);
    assertStringIncludes(folioText, 'I · TEXT');
    assertStringIncludes(folioText, '01');
    assertStringIncludes(folioText, expectedTotal);
  },
});

// ============================================================================
// Test Suite: Home component - the sequence of movements
// ============================================================================

Deno.test({
  name: 'Home - sequence article renders one <section class="movement"> per movement, numbered in order',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const sequence = findByTagAndClass(tree, 'article', 'sequence');
    assertExists(sequence);
    assertEquals(sequence!.props.id, 'sequence');

    const movementSections = findAllByTagAndClass(sequence, 'section', 'movement');
    assert(movementSections.length > 0, 'expected at least one movement section');

    movementSections.forEach((section, index) => {
      assert(hasClass(section, `movement-${index + 1}`), `section ${index} missing movement-${index + 1} class`);

      const indexLabel = findFirst(section, byTag('span'));
      assertExists(indexLabel);
      assertEquals(textOf(indexLabel), String(index + 1).padStart(2, '0'));
    });
  },
});

Deno.test({
  name: 'Home - only the first movement paragraph carries the "first-movement" drop-cap class',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const movementSections = findAllByTagAndClass(tree, 'section', 'movement');

    movementSections.forEach((section, index) => {
      const paragraph = findFirst(section, byTag('p'));
      assertExists(paragraph);
      const expectedClass = index === 0 ? 'first-movement' : '';
      assertEquals(paragraph!.props.class, expectedClass);
    });
  },
});

Deno.test({
  name: 'Home - a section-break separates every movement except the last',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const movementSections = findAllByTagAndClass(tree, 'section', 'movement');
    const breaks = findAllByTagAndClass(tree, 'div', 'section-break');

    assertEquals(breaks.length, movementSections.length - 1);

    movementSections.forEach((section, index) => {
      const sectionBreaks = findAllByTagAndClass(section, 'div', 'section-break');
      assertEquals(sectionBreaks.length, index < movementSections.length - 1 ? 1 : 0);
    });
  },
});

Deno.test({
  name: 'Home - first movement includes the example question/answer pair verbatim',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const question = findByTagAndClass(tree, 'span', 'question');
    const answer = findByTagAndClass(tree, 'span', 'answer');

    assertExists(question);
    assertExists(answer);
    assertEquals(textOf(question), 'Who or what is your greatest love?');
    assertEquals(textOf(answer), 'Big dick Tony.');
  },
});

// ============================================================================
// Test Suite: Home component - call to action & footer
// ============================================================================

Deno.test({
  name: 'Home - the sequence ends with a call to begin the questionnaire at /gate',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const cta = findByTagAndClass(tree, 'section', 'begin-questionnaire');
    assertExists(cta);

    const paragraph = findFirst(cta, byTag('p'));
    assertExists(paragraph);
    assertEquals(textOf(paragraph), 'The main sequence awaits.');

    const link = findFirst(cta, byTag('a'));
    assertExists(link);
    assertEquals(link!.props.href, '/gate');
    assertEquals(textOf(link), 'Begin the questionnaire →');
  },
});

Deno.test({
  name: 'Home - footer links back to #top and repeats the wordmark',
  fn() {
    const tree = Home() as unknown as AnyVNode;
    const footer = findFirst(tree, byTag('footer'));
    assertExists(footer);
    assertEquals(footer!.props.id, 'about');

    const footerLinks = findAll(footer, byTag('a'));
    const hrefs = footerLinks.map((link) => link.props.href);
    assert(hrefs.includes('#top'));

    const returnLink = footerLinks.find((link) => textOf(link).includes('Return to the beginning'));
    assertExists(returnLink);
    assertEquals(textOf(returnLink), 'Return to the beginning ↑');

    const paragraph = findFirst(footer, byTag('p'));
    assertExists(paragraph);
    assertEquals(textOf(paragraph), 'A sequence for becoming acquainted with one self.');
  },
});