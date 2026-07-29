import { assert, assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ShopPage from './shop.tsx';

Deno.test('shop page carries a conspicuous affiliate disclosure', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'affiliate');
});

Deno.test('affiliate disclosure appears above the catalog, not buried below it', () => {
  const html = render(<ShopPage />);
  const disclosureIndex = html.indexOf('affiliate');
  const catalogIndex = html.indexOf('Swann');
  assert(disclosureIndex !== -1, 'disclosure text ("affiliate") not found in rendered HTML');
  assert(catalogIndex !== -1, 'catalog item ("Swann") not found in rendered HTML');
  assert(
    disclosureIndex < catalogIndex,
    `expected the affiliate disclosure (index ${disclosureIndex}) to appear before the ` +
      `catalog (index ${catalogIndex}), but the catalog came first — the disclosure is no ` +
      'longer conspicuous/above the fold',
  );
});

Deno.test('shop page lists every Proust volume and de Botton', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'Swann');
  assertStringIncludes(html, 'Finding Time Again');
  assertStringIncludes(html, 'How Proust Can Change Your Life');
});

Deno.test('each book offers both retailers', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'penguinrandomhouse.com');
  assertStringIncludes(html, 'amazon.com');
});

Deno.test('tees link to Stripe and show the inclusive price', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'https://buy.stripe.com/');
  assertStringIncludes(html, '$35');
});
