import { assertStringIncludes } from '$std/assert/mod.ts';
import { render } from 'preact-render-to-string';
import ShopPage from './shop.tsx';

Deno.test('shop page carries a conspicuous affiliate disclosure', () => {
  const html = render(<ShopPage />);
  assertStringIncludes(html, 'affiliate');
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
